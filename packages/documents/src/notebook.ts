import type { ModelJudgment } from "catcolab-document-types";
import type { DblModel } from "catlog-wasm";
import { attachDocument, getAttachedDocumentRef, type AttachedDocument } from "./attached-document";
import {
    cellHandle,
    endpointValue,
    objectGeneratorId,
    type Cell,
    type InstantiationCell,
    type MorphismCell,
    type ObjectCell,
    type RichTextCell,
} from "./cell";
import { morphismTypesEqual, objectTypesEqual } from "./equality";
import {
    duplicateModelJudgment,
    modelNotebookFormat,
    newInstantiationJudgment,
    newMorphismJudgment,
    newObjectJudgment,
    type ModelDocument,
} from "./model-document";
import { validateModel } from "./model-validation";
import { createNotebookCore, getNotebookCore, registerNotebookCore } from "./notebook-core";
import { createNotebookEditor, type FormalCellFamily } from "./notebook-editor";
import { observeValidation } from "./observe-validation";
import type { Result } from "./result";
import {
    type CellType,
    type EndpointObjectTypes,
    type InstantiationType,
    type MorphismType,
    type MorphismTypes,
    type ObjectType,
    type RichTextType,
    type Shape,
} from "./shape";
import type { DocumentStore } from "./store";

export interface InstantiationSpecialization {
    readonly object: ObjectCell<ObjectType>;
    readonly as: ObjectCell<ObjectType>;
}

export interface InstantiationArgs<Handle> {
    readonly label: string;
    readonly model: Notebook<Shape, Handle>;
    readonly specializations?: readonly InstantiationSpecialization[];
}

type ModelCellType<S extends Shape> = RichTextType | InstantiationType | CellType<S>;

type AddValue<S extends Shape, Handle, T extends ModelCellType<S>> = T extends RichTextType
    ? { content: string }
    : T extends InstantiationType
      ? InstantiationArgs<Handle>
      : T extends ObjectType
        ? { label: string | null }
        : T extends MorphismType
          ? {
                label: string | null;
                from: ObjectCell<EndpointObjectTypes<S, T>> | null;
                to: ObjectCell<EndpointObjectTypes<S, T>> | null;
            }
          : never;

type AddedCell<S extends Shape, T extends ModelCellType<S>> = T extends RichTextType
    ? RichTextCell
    : T extends InstantiationType
      ? InstantiationCell
      : T extends ObjectType
        ? ObjectCell<T>
        : T extends MorphismType
          ? MorphismCell<S, T>
          : never;

interface ModelNotebookMethods<S extends Shape, Handle> {
    readonly shape: S;
    add<T extends ModelCellType<S>>(type: T, value: AddValue<S, Handle, T>): AddedCell<S, T>;
    cells(): readonly Cell<S>[];
    cellsOf<T extends ModelCellType<S>>(type: T): readonly AddedCell<S, T>[];
    get<T extends ModelCellType<S>>(type: T, id: string): Result<AddedCell<S, T>>;
    validate(): Promise<Result<DblModel>>;
    onValidate(callback: (result: Result<DblModel>) => void): () => void;
}

export type Notebook<S extends Shape, Handle = unknown> = AttachedDocument<ModelDocument, Handle> &
    ModelNotebookMethods<S, Handle>;

function modelJudgmentTag(content: unknown): ModelJudgment["tag"] | undefined {
    if (typeof content !== "object" || content === null || !("tag" in content)) {
        return undefined;
    }
    return (content as { tag?: ModelJudgment["tag"] }).tag;
}

export function attachModelNotebook<Handle, S extends Shape>(
    store: DocumentStore<Handle>,
    handle: Handle,
    shape: S,
): Notebook<S, Handle> {
    const core = createNotebookCore(store, handle, modelNotebookFormat);
    const attached = attachDocument(store, handle, "model");
    const modelCells: FormalCellFamily<ModelJudgment> = {
        supportsType(type) {
            const kind = (type as { kind?: unknown } | null)?.kind;
            return kind === "object" || kind === "morphism" || kind === "instantiation";
        },
        supportsContent(content): content is ModelJudgment {
            const tag = modelJudgmentTag(content);
            return tag === "object" || tag === "morphism" || tag === "instantiation";
        },
        create(type, value) {
            const cellType = type as ModelCellType<S>;
            if (cellType.kind === "object") {
                return newObjectJudgment(
                    cellType.obType,
                    (value as { label: string | null }).label,
                );
            }
            if (cellType.kind === "instantiation") {
                const args = value as InstantiationArgs<Handle>;
                const modelRef = getAttachedDocumentRef(args.model);
                const modelCore = getNotebookCore<ModelJudgment>(args.model);
                return newInstantiationJudgment({
                    label: args.label,
                    model: {
                        type: "instantiation",
                        _id: modelRef.id,
                        _version: modelRef.version,
                        _server: modelRef.server ?? "",
                    },
                    specializations: (args.specializations ?? []).map((specialization) => ({
                        id: objectGeneratorId(modelCore, specialization.object),
                        ob: endpointValue(core, specialization.as),
                    })),
                });
            }
            if (cellType.kind === "morphism") {
                const morphism = value as AddValue<S, Handle, MorphismTypes<S>>;
                return newMorphismJudgment({
                    morType: cellType.morType,
                    label: morphism.label,
                    dom: endpointValue(core, morphism.from),
                    cod: endpointValue(core, morphism.to),
                });
            }
            throw new Error("Cell type is not supported by model formal content.");
        },
        attach(cellId) {
            return cellHandle(shape, core, cellId);
        },
        matches(type, content) {
            const cellType = type as ModelCellType<S>;
            const tag = modelJudgmentTag(content);
            if (cellType.kind === "instantiation") {
                return tag === "instantiation";
            }
            if (cellType.kind === "object") {
                return (
                    tag === "object" &&
                    objectTypesEqual(
                        cellType.obType,
                        (content as Extract<ModelJudgment, { tag: "object" }>).obType,
                    )
                );
            }
            return (
                cellType.kind === "morphism" &&
                tag === "morphism" &&
                morphismTypesEqual(
                    cellType.morType,
                    (content as Extract<ModelJudgment, { tag: "morphism" }>).morType,
                )
            );
        },
        duplicate(content) {
            return duplicateModelJudgment(content);
        },
    };
    const editor = createNotebookEditor(core, [modelCells]);
    const methods: ModelNotebookMethods<S, Handle> = {
        shape,
        add<T extends ModelCellType<S>>(type: T, value: AddValue<S, Handle, T>) {
            return editor.add(type, value) as AddedCell<S, T>;
        },
        cells() {
            return editor.cells() as Cell<S>[];
        },
        cellsOf<T extends ModelCellType<S>>(type: T) {
            return editor.cellsOf(type) as AddedCell<S, T>[];
        },
        get<T extends ModelCellType<S>>(type: T, id: string): Result<AddedCell<S, T>> {
            return editor.get(type, id) as Result<AddedCell<S, T>>;
        },
        validate() {
            return validateModel(store, handle);
        },
        onValidate(callback) {
            return observeValidation({
                subscribe: attached.onChange,
                validate: () => validateModel(store, handle),
                dispose: (model) => model.free(),
                callback,
            });
        },
    };
    const notebook = Object.assign(attached, methods);
    registerNotebookCore(notebook, core);
    return notebook;
}
