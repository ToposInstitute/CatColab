import type { FormalCell, ModelDocument } from "catcolab-document-methods";
import type { ModelJudgment, Notebook } from "catcolab-document-types";
import type {
    DblModel,
    DblTheory,
    InvalidDblModel,
    InvalidModelEqn,
    ModelPresentation,
} from "catlog-wasm";
import { documentCacheFor, type DocumentStore } from "../document-store";
import type { Issue } from "../result";
import type { Shape } from "../shape";
import { elaboratedModelFromPresentation, type ModelValidation } from "./elaborated-model";

/** An index of the formal cells of a notebook by the generator they declare. */
type GeneratorIndex = ReadonlyMap<string, FormalCell<ModelJudgment>>;

function formalCellsByGeneratorId(notebook: Notebook<ModelJudgment>): GeneratorIndex {
    const index = new Map<string, FormalCell<ModelJudgment>>();
    for (const cellId of notebook.cellOrder) {
        const cell = notebook.cellContents[cellId];
        if (cell?.tag === "formal" && "id" in cell.content && !index.has(cell.content.id)) {
            index.set(cell.content.id, cell);
        }
    }
    return index;
}

function generatorName(index: GeneratorIndex, generatorId: string): string {
    const cell = index.get(generatorId);
    if (!cell || !cell.content.name) {
        return generatorId;
    }
    return cell.content.name;
}

function generatorPath(
    index: GeneratorIndex,
    generatorId: string,
    property?: string,
): PropertyKey[] | undefined {
    const cell = index.get(generatorId);
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

function invalidModelIssue(index: GeneratorIndex, error: InvalidDblModel): Issue {
    switch (error.tag) {
        case "Dom":
            return {
                message: `Morphism \`${generatorName(index, error.content)}\` has no domain`,
                path: generatorPath(index, error.content, "dom"),
            };
        case "Cod":
            return {
                message: `Morphism \`${generatorName(index, error.content)}\` has no codomain`,
                path: generatorPath(index, error.content, "cod"),
            };
        case "ObType":
            return {
                message: `Object \`${generatorName(index, error.content)}\` has an invalid type`,
                path: generatorPath(index, error.content, "obType"),
            };
        case "MorType":
            return {
                message: `Morphism \`${generatorName(index, error.content)}\` has an invalid type`,
                path: generatorPath(index, error.content, "morType"),
            };
        case "DomType":
            return {
                message: `Morphism \`${generatorName(index, error.content)}\` has a mistyped domain`,
                path: generatorPath(index, error.content, "dom"),
            };
        case "CodType":
            return {
                message: `Morphism \`${generatorName(index, error.content)}\` has a mistyped codomain`,
                path: generatorPath(index, error.content, "cod"),
            };
        case "Eqn": {
            const [name, errors] = error.content;
            const details = (errors ?? []).map(eqnErrorMessage).join("; ");
            return {
                message: `Equation \`${generatorName(index, name)}\` is invalid: ${details}`,
                path: generatorPath(index, name),
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
                message: `Instantiation \`${generatorName(index, error.content)}\` is invalid`,
                path: generatorPath(index, error.content),
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
    document: Readonly<ModelDocument>,
    theory: DblTheory,
    refId: string,
): Promise<ModelValidationState> {
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
        let issues: Issue[] = [];
        if (validation.tag === "Err") {
            const index = formalCellsByGeneratorId(document.notebook);
            issues = validation.content.map((error) => invalidModelIssue(index, error));
        }
        return { presentation, issues };
    } finally {
        model.free();
    }
}

/** One-shot validation and change callbacks for a notebook. */
export interface NotebookValidator<S extends Shape> {
    validate(): Promise<ModelValidation<S>>;
    onValidate(callback: (result: ModelValidation<S>) => void): () => void;
}

/** Create the validation machinery for a notebook over a document store.

The result is cached per generation of the handle's shared document cache,
so the document is elaborated and validated at most once per change no
matter how many consumers ask. */
export function createNotebookValidator<Handle, S extends Shape>(
    shape: S,
    store: DocumentStore<Handle>,
    handle: Handle,
): NotebookValidator<S> {
    const cache = documentCacheFor(store, handle);
    let coreTheory: Promise<DblTheory> | undefined;

    /** Elaborate and validate the current document.

    A structurally invalid document reports its structural issues and is not
    elaborated. */
    async function elaborateAndValidate(): Promise<ModelValidation<S>> {
        const state = await stateFromDocument();
        return {
            model: elaboratedModelFromPresentation(shape, () => state.presentation),
            issues: state.issues,
        };
    }

    async function stateFromDocument(): Promise<ModelValidationState> {
        const structuralIssues = cache.structuralIssues();
        if (structuralIssues.length > 0) {
            return { issues: structuralIssues };
        }
        const documentType = store.getDocumentView(handle).type;
        if (documentType !== "model") {
            return {
                issues: [
                    {
                        message: `Cannot validate a document of type "${documentType}" as a model.`,
                        path: ["type"],
                    },
                ],
            };
        }
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
            const document = cache.snapshot() as Readonly<ModelDocument>;
            return await validateModelDocument(document, theory, store.getDocumentRef(handle).id);
        } catch (error) {
            return {
                issues: [{ message: `Failed to load core theory: ${String(error)}` }],
            };
        }
    }

    /** The validation result for the current generation, computed at most
    once per change, so unchanged documents yield identical results. */
    let current: { generation: number; validation: Promise<ModelValidation<S>> } | undefined;
    function currentValidation(): Promise<ModelValidation<S>> {
        const generation = cache.generation();
        if (current === undefined || current.generation !== generation) {
            current = { generation, validation: elaborateAndValidate() };
        }
        return current.validation;
    }

    const listeners = new Set<(result: ModelValidation<S>) => void>();
    let unsubscribe: (() => void) | undefined;

    /** Revalidate the document and publish the outcome to listeners. When the
    document changes while validation is in flight, the stale outcome is not
    published: the change triggers another revalidation whose outcome is.
    Every caller still receives its own outcome. */
    async function revalidate(): Promise<ModelValidation<S>> {
        const generation = cache.generation();
        const validation = await currentValidation();
        if (generation === cache.generation()) {
            for (const listener of listeners) {
                listener(validation);
            }
        }
        return validation;
    }

    return {
        validate: revalidate,
        /** Subscribe to validation, revalidating on every document change. The
        callback receives an initial result once revalidation completes. */
        onValidate(callback) {
            listeners.add(callback);
            if (unsubscribe === undefined) {
                unsubscribe = store.subscribe(handle, () => {
                    void revalidate();
                });
            }
            void revalidate();

            return () => {
                if (!listeners.delete(callback)) {
                    return;
                }
                if (listeners.size === 0) {
                    unsubscribe?.();
                    unsubscribe = undefined;
                }
            };
        },
    };
}
