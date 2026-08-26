import type { FormalCell, ModelDocument } from "catcolab-document-methods";
import type { ModelJudgment, Notebook } from "catcolab-document-types";
import type { DblModel, DblTheory, InvalidDblModel, ModelPresentation } from "catlog-wasm";
import { createReactiveView, type DocumentStore } from "../document-store";
import type { Issue, Result } from "../result";
import type { Shape } from "../shape";
import {
    elaboratedModelFromPresentation,
    type ElaboratedModel,
    type ValidationView,
} from "./elaborated-model";

function formalCellForGenerator(
    notebook: Notebook<ModelJudgment>,
    generatorId: string,
): FormalCell<ModelJudgment> | undefined {
    for (const cellId of notebook.cellOrder) {
        const cell = notebook.cellContents[cellId];
        if (cell?.tag === "formal" && "id" in cell.content && cell.content.id === generatorId) {
            return cell;
        }
    }
    return undefined;
}

function generatorName(notebook: Notebook<ModelJudgment>, generatorId: string): string {
    const cell = formalCellForGenerator(notebook, generatorId);
    if (!cell || !cell.content.name) {
        return generatorId;
    }
    return cell.content.name;
}

function generatorPath(
    notebook: Notebook<ModelJudgment>,
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

function invalidModelIssue(notebook: Notebook<ModelJudgment>, error: InvalidDblModel): Issue {
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
        case "Eqn":
            return {
                message: "An equation in the model is invalid",
            };
        case "UnsupportedFeature":
            return {
                message: `The model uses an unsupported feature: ${error.content.tag}`,
            };
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
export interface ModelValidation {
    /** Presentation of the elaborated model; absent if elaboration failed. */
    readonly presentation?: ModelPresentation;
    /** Validation issues; empty when the document is valid. */
    readonly issues: ReadonlyArray<Issue>;
}

/** Elaborate and validate a model document against its core theory. Total:
elaboration and validation failures are values. */
export async function validateModelDocument(
    document: Readonly<ModelDocument>,
    theory: DblTheory,
    refId: string,
): Promise<ModelValidation> {
    const { DblModelMap, elaborateModel } = await import("catlog-wasm");
    const instantiatedModels = new DblModelMap();
    let model: DblModel;
    try {
        model = elaborateModel(document.notebook, instantiatedModels, theory, refId);
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

/** The validation surface of a notebook: one-shot validation, validation
callbacks, and live validation views. */
export interface NotebookValidator<S extends Shape> {
    validate(): Promise<Result<ElaboratedModel<S>>>;
    onValidate(callback: (result: Result<ElaboratedModel<S>>) => void): () => void;
    createValidationView(): ValidationView<S>;
}

/** The state shared by all validation consumers of a notebook. */
type ValidationState = ModelValidation;

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

    /** Elaborate and validate the current document. */
    async function elaborateAndValidate(): Promise<ModelValidation> {
        if (!shape.getCoreTheory) {
            let shapeName = "unnamed";
            if (shape.theory) {
                shapeName = shape.theory;
            }
            return {
                issues: [{ message: `Shape \`${shapeName}\` has no core theory` }],
            };
        }
        try {
            if (!coreTheory) {
                coreTheory = shape.getCoreTheory();
            }
            const theory = await coreTheory;
            const document = store.copyValue(
                handle,
                store.getDocumentView(handle),
            ) as ModelDocument;
            return await validateModelDocument(document, theory, store.getDocumentRef(handle).id);
        } catch (error) {
            return {
                issues: [{ message: `Failed to load core theory: ${String(error)}` }],
            };
        }
    }

    /** Convert a validation state into the `Result` exposed by `validate` and
    `onValidate`. Ok only when elaboration succeeded and there are no issues. */
    function resultFromValidation({
        presentation,
        issues,
    }: ModelValidation): Result<ElaboratedModel<S>> {
        if (issues.length > 0 || presentation === undefined) {
            return { tag: "Err", content: issues };
        }
        return {
            tag: "Ok",
            content: elaboratedModelFromPresentation(shape, () => presentation),
        };
    }

    let latestValidationState: ValidationState = {
        issues: [{ message: "The notebook has not been validated yet." }],
    };
    const validationStateListeners = new Set<(state: ValidationState) => void>();
    let unsubscribeValidationSource: (() => void) | undefined;
    let revalidationCounter = 0;

    function publishValidationState(state: ValidationState): void {
        latestValidationState = state;
        for (const listener of validationStateListeners) {
            listener(state);
        }
    }

    /** Revalidate the document and publish the outcome to listeners. When
    revalidations overlap, only the latest-started one publishes, so listeners
    never observe stale state; every caller still receives its own outcome. */
    async function revalidate(): Promise<ModelValidation> {
        const ticket = ++revalidationCounter;
        const state = await elaborateAndValidate();
        if (ticket === revalidationCounter) {
            publishValidationState(state);
        }
        return state;
    }

    /** Subscribe to validation state, revalidating on every document change.
    The listener receives an initial publish once revalidation completes. */
    function subscribeToValidationState(listener: (state: ValidationState) => void): () => void {
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
            }
        };
    }

    return {
        async validate() {
            return resultFromValidation(await revalidate());
        },
        onValidate(callback) {
            return subscribeToValidationState((state) => {
                callback(resultFromValidation(state));
            });
        },
        createValidationView(): ValidationView<S> {
            const reactiveView = createReactiveView(store, latestValidationState);
            const dispose = subscribeToValidationState((state) => {
                reactiveView.replace(state);
            });

            const model = elaboratedModelFromPresentation(
                shape,
                () => reactiveView.current.presentation,
            );

            return {
                model,
                get issues(): ReadonlyArray<Issue> {
                    return reactiveView.current.issues;
                },
                dispose,
            };
        },
    };
}
