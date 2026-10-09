import type { ModelNotebook } from "catcolab-document-types";
import type {
    DblModel,
    DblTheory,
    InvalidDblModel,
    InvalidModelEqn,
    ModelPresentation,
} from "catlog-wasm";
import type { DeepReadonly, DocumentSnapshot, DocumentStore } from "../document-store";
import type { Issue } from "../result";
import type { Shape } from "../shape";
import { elaboratedModelFromPresentation, type ModelValidation } from "./elaborated-model";
import type { ParsedModelCell, ParsedModelDocument, ParsedModelNotebook } from "./parsed-document";
import { parseModelSnapshot } from "./parsed-source";

function formalCellForGenerator(
    notebook: ParsedModelNotebook,
    generatorId: string,
): DeepReadonly<Extract<ParsedModelCell, { tag: "formal" }>> | undefined {
    for (const cellId of notebook.cellOrder) {
        const cell = notebook.cellContents[cellId]!;
        if (cell.tag === "formal" && cell.content.id === generatorId) {
            return cell;
        }
    }
    return undefined;
}

function generatorName(notebook: ParsedModelNotebook, generatorId: string): string {
    const cell = formalCellForGenerator(notebook, generatorId);
    if (!cell || !cell.content.name) {
        return generatorId;
    }
    return cell.content.name;
}

function generatorPath(
    notebook: ParsedModelNotebook,
    generatorId: string,
    property?: string,
): PropertyKey[] | undefined {
    const cell = formalCellForGenerator(notebook, generatorId);
    if (!cell) {
        return undefined;
    }
    const path: PropertyKey[] = ["notebook", "cellContents", cell.id, "content"];
    if (property) {
        path.push(property);
    }
    return path;
}

/** A failure of an equation in a model of a double theory to be well defined. */
function eqnErrorMessage(error: InvalidModelEqn): string {
    switch (error.tag) {
        case "Lhs":
            return "left-hand side fails to synthesize";
        case "Rhs":
            return "right-hand side fails to synthesize";
        case "Src":
            return "sources of the sides don't coincide";
        case "Tgt":
            return "targets of the sides don't coincide";
        case "MorType":
            return "sides have different types";
    }
}

function invalidModelIssue(notebook: ParsedModelNotebook, error: InvalidDblModel): Issue {
    switch (error.tag) {
        case "Dom":
            return {
                message: `Morphism \`${generatorName(notebook, error.content)}\` has no domain`,
                path: generatorPath(notebook, error.content, "dom"),
            };
        case "Cod":
            return {
                message: `Morphism \`${generatorName(notebook, error.content)}\` has no codomain`,
                path: generatorPath(notebook, error.content, "cod"),
            };
        case "ObType":
            return {
                message: `Object \`${generatorName(notebook, error.content)}\` has an invalid type`,
                path: generatorPath(notebook, error.content, "obType"),
            };
        case "MorType":
            return {
                message: `Morphism \`${generatorName(notebook, error.content)}\` has an invalid type`,
                path: generatorPath(notebook, error.content, "morType"),
            };
        case "DomType":
            return {
                message: `Morphism \`${generatorName(notebook, error.content)}\` has a mistyped domain`,
                path: generatorPath(notebook, error.content, "dom"),
            };
        case "CodType":
            return {
                message: `Morphism \`${generatorName(notebook, error.content)}\` has a mistyped codomain`,
                path: generatorPath(notebook, error.content, "cod"),
            };
        case "Eqn": {
            const [name, errors] = error.content;
            const details = (errors ?? []).map(eqnErrorMessage).join("; ");
            return {
                message: `Equation \`${generatorName(notebook, name)}\` is invalid: ${details}`,
                path: generatorPath(notebook, name),
            };
        }
        case "UnsupportedFeature": {
            if (error.content.tag === "PartialEquation") {
                return { message: "An equation in the model is missing a side" };
            }
            return { message: `The model uses an unsupported feature: ${error.content.tag}` };
        }
        case "InvalidLink":
            return {
                message: `Instantiation \`${generatorName(notebook, error.content)}\` is invalid`,
                path: generatorPath(notebook, error.content),
            };
    }
}

/** The outcome of elaborating and then validating a model document.

Elaboration and validation are separate steps: even an invalid model has a
presentation, so `presentation` is absent only when elaboration itself fails. */
interface ModelValidationState {
    /** Presentation of the elaborated model; absent if elaboration failed. */
    readonly presentation?: ModelPresentation;
    /** Validation issues; empty when the document is valid. */
    readonly issues: ReadonlyArray<Issue>;
}

/** Elaborate and validate a model document against its core theory. Total:
elaboration and validation failures are values. */
export async function validateModelDocument(
    document: ParsedModelDocument,
    theory: DblTheory,
    refId: string,
): Promise<ModelValidationState> {
    const { DblModelMap, elaborateModel } = await import("catlog-wasm");
    const instantiatedModels = new DblModelMap();
    let model: DblModel;
    try {
        // The generated Wasm binding accepts mutable types but only deserializes
        // this value; no mutable reference to the snapshot is retained.
        model = elaborateModel(
            document.notebook as unknown as ModelNotebook,
            instantiatedModels,
            theory,
            refId,
        );
    } catch (error) {
        return {
            issues: [{ message: `Failed to elaborate model: ${String(error)}` }],
        };
    } finally {
        instantiatedModels.free();
    }

    try {
        const presentation = model.presentation();
        const validation = model.validate();
        const issues =
            validation.tag === "Err"
                ? validation.content.map((error) => invalidModelIssue(document.notebook, error))
                : [];
        return { presentation, issues };
    } finally {
        model.free();
    }
}

/** Current-document validation and change callbacks for a notebook. */
export interface NotebookValidator<S extends Shape = Shape> {
    validate(): Promise<ModelValidation<S>>;
    onValidate(callback: (result: ModelValidation<S>) => void): () => void;
}

/** Create the validation machinery for a notebook over a document store.

All consumers share one code path and one source of truth: the document is
revalidated at most once per change and the store is only subscribed while at
least one listener is active. */
export function createNotebookValidator<Handle, S extends Shape>(
    shape: S,
    store: DocumentStore<Handle>,
    handle: Handle,
): NotebookValidator<S> {
    let coreTheory: Promise<DblTheory> | undefined;
    const validations = new WeakMap<DocumentSnapshot, Promise<ModelValidation<S>>>();

    /** Elaborate and validate the current document. */
    async function elaborateAndValidate(snapshot: DocumentSnapshot): Promise<ModelValidationState> {
        const parsed = parseModelSnapshot(snapshot);
        if (parsed.tag === "Err") {
            return { issues: parsed.content };
        }
        const { value: document, issues: structuralIssues } = parsed.content;
        if (!shape.getCoreTheory) {
            let shapeName = "unnamed";
            if (shape.theory) {
                shapeName = shape.theory;
            }
            return {
                issues: [
                    ...structuralIssues,
                    { message: `Shape \`${shapeName}\` has no core theory` },
                ],
            };
        }
        try {
            if (!coreTheory) {
                coreTheory = shape.getCoreTheory();
            }
            const theory = await coreTheory;
            const state = await validateModelDocument(
                document,
                theory,
                store.getDocumentRef(handle).id,
            );
            return { ...state, issues: [...structuralIssues, ...state.issues] };
        } catch (error) {
            return {
                issues: [
                    ...structuralIssues,
                    { message: `Failed to load core theory: ${String(error)}` },
                ],
            };
        }
    }

    /** Convert internal validation state into the public snapshot. */
    function modelValidationFromState(
        { presentation, issues }: ModelValidationState,
        revision: object,
    ): ModelValidation<S> {
        return {
            revision,
            model: elaboratedModelFromPresentation(shape, () => presentation),
            issues,
        };
    }

    const validationStateListeners = new Set<(validation: ModelValidation<S>) => void>();
    let unsubscribeValidationSource: (() => void) | undefined;
    let revalidationCounter = 0;

    function publishValidationState(state: ModelValidation<S>): void {
        for (const listener of validationStateListeners) {
            listener(state);
        }
    }

    /** Revalidate the document and publish the outcome to listeners. When
    revalidations overlap, only the latest-started one publishes, so listeners
    never observe stale state. Retry if the document changed while awaiting
    elaboration so callers also receive validation of the current document. */
    async function revalidate(): Promise<ModelValidation<S>> {
        const ticket = ++revalidationCounter;
        let state: ModelValidation<S>;
        do {
            const snapshot = store.getDocumentSnapshot(handle);
            let validation = validations.get(snapshot);
            if (validation === undefined) {
                validation = elaborateAndValidate(snapshot).then((state) =>
                    modelValidationFromState(state, snapshot.revision),
                );
                validations.set(snapshot, validation);
            }
            state = await validation;
        } while (store.getDocumentSnapshot(handle).revision !== state.revision);
        if (ticket === revalidationCounter) {
            publishValidationState(state);
        }
        return state;
    }

    /** Subscribe to validation state, revalidating on every document change.
    The listener receives an initial publish once revalidation completes. */
    function subscribeToValidationState(listener: (state: ModelValidation<S>) => void): () => void {
        validationStateListeners.add(listener);
        if (unsubscribeValidationSource === undefined) {
            unsubscribeValidationSource = store.subscribe(handle, () => {
                void revalidate();
            });
        }
        void revalidate();

        return () => {
            if (!validationStateListeners.delete(listener)) {
                return;
            }
            if (validationStateListeners.size === 0) {
                unsubscribeValidationSource?.();
                unsubscribeValidationSource = undefined;
                // Invalidate work started in a previous subscription lifetime.
                revalidationCounter += 1;
            }
        };
    }

    return {
        async validate() {
            return revalidate();
        },
        onValidate(callback) {
            return subscribeToValidationState(callback);
        },
    };
}
