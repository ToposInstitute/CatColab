import { Model, Nb } from "catcolab-document-methods";
import type { ModelJudgment } from "catcolab-document-types";
import type { DblModel } from "catlog-wasm";
import {
    cellHandle,
    endpointValue,
    instantiationHandle,
    morphismHandle,
    objectGeneratorId,
    objectHandle,
    richTextHandle,
    type Cell,
    type InstantiationCell,
    type MorphismCell,
    type ObjectCell,
    type RichTextCell,
} from "./cell";
import { morphismTypesEqual, objectTypesEqual } from "./equality";
import {
    changeModelDocument,
    getModelDocumentView,
    type ModelDocument,
    type ModelDocumentView,
} from "./model-document";
import type { Result } from "./result";
import {
    type CellType,
    type EndpointObjectTypes,
    type InstantiationType,
    type MorphismType,
    type MorphismTypes,
    type ObjectType,
    type ObjectTypes,
    type RichTextType,
    type Shape,
} from "./shape";
import type { DocumentRef, DocumentStore } from "./store";
import { validateDocument } from "./validation";

export interface InstantiationSpecialization {
    readonly object: ObjectCell<ObjectType>;
    readonly as: ObjectCell<ObjectType>;
}

export interface InstantiationArgs<Handle> {
    readonly label: string;
    readonly model: Notebook<Shape, Handle>;
    readonly specializations?: readonly InstantiationSpecialization[];
}

type AddValue<S extends Shape, Handle, T extends CellType<S>> = T extends RichTextType
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

type AddedCell<S extends Shape, T extends CellType<S>> = T extends RichTextType
    ? RichTextCell
    : T extends InstantiationType
      ? InstantiationCell
      : T extends ObjectType
        ? ObjectCell<T>
        : T extends MorphismType
          ? MorphismCell<S, T>
          : never;

export interface Notebook<S extends Shape, Handle = unknown> {
    readonly shape: S;
    readonly handle: Handle;
    readonly document: ModelDocumentView;
    readonly title: string;
    add<T extends CellType<S>>(type: T, value: AddValue<S, Handle, T>): AddedCell<S, T>;
    cells(): readonly Cell<S>[];
    cellsOf<T extends CellType<S>>(type: T): readonly AddedCell<S, T>[];
    get<T extends CellType<S>>(type: T, id: string): Result<AddedCell<S, T>>;
    update(patch: Partial<{ title: string }>): void;
    dump(): ModelDocument;
    onChange(callback: () => void): () => void;
    validate(): Promise<Result<DblModel>>;
    onValidate(callback: (result: Result<DblModel>) => void): () => void;
}

const notebookRefs = new WeakMap<object, () => DocumentRef>();

function refForNotebook(notebook: Notebook<Shape, unknown>): DocumentRef {
    const getRef = notebookRefs.get(notebook);
    if (!getRef) throw new Error("Notebook is not attached to a document reference.");
    return getRef();
}

function typeMatches<S extends Shape>(type: CellType<S>, cell: Cell<S>): boolean {
    if (type.kind === "rich-text") return cell.kind === "rich-text";
    if (type.kind === "instantiation") return cell.kind === "instantiation";
    if (type.kind === "object") {
        return cell.kind === "object" && objectTypesEqual(type.obType, cell.type.obType);
    }
    return cell.kind === "morphism" && morphismTypesEqual(type.morType, cell.type.morType);
}

export function notebookFromDocument<Handle, S extends Shape>(
    store: DocumentStore<Handle>,
    handle: Handle,
    shape: S,
): Notebook<S, Handle> {
    const append = (cell: ReturnType<typeof Nb.newRichTextCell> | Nb.FormalCell<ModelJudgment>) => {
        changeModelDocument(store, handle, (document) => Nb.appendCell(document.notebook, cell));
    };

    const notebook: Notebook<S, Handle> = {
        shape,
        handle,
        get document() {
            return getModelDocumentView(store, handle);
        },
        get title() {
            return getModelDocumentView(store, handle).name;
        },
        add<T extends CellType<S>>(type: T, value: AddValue<S, Handle, T>) {
            if (type.kind === "rich-text") {
                const cell = Nb.newRichTextCell((value as { content: string }).content);
                append(cell);
                return richTextHandle(store, handle, cell.id) as AddedCell<S, T>;
            }
            if (type.kind === "object") {
                const judgment = Model.newObjectDecl(type.obType);
                judgment.name = (value as { label: string | null }).label ?? "";
                const cell = Nb.newFormalCell<ModelJudgment>(judgment);
                append(cell);
                return objectHandle(store, handle, cell.id, type as ObjectTypes<S>) as AddedCell<S, T>;
            }
            if (type.kind === "instantiation") {
                const args = value as InstantiationArgs<Handle>;
                const ref = refForNotebook(args.model);
                const judgment = Model.newInstantiatedModel({
                    type: "instantiation",
                    _id: ref.id,
                    _version: ref.version,
                    _server: ref.server ?? "",
                });
                judgment.name = args.label;
                judgment.specializations = (args.specializations ?? []).map((specialization) => ({
                    id: objectGeneratorId(store, args.model.handle, specialization.object),
                    ob: endpointValue(store, handle, specialization.as),
                }));
                const cell = Nb.newFormalCell<ModelJudgment>(judgment);
                append(cell);
                return instantiationHandle(store, handle, cell.id) as AddedCell<S, T>;
            }
            const morphism = value as AddValue<S, Handle, MorphismTypes<S>>;
            const judgment = Model.newMorphismDecl(type.morType);
            judgment.name = morphism.label ?? "";
            judgment.dom = endpointValue(store, handle, morphism.from);
            judgment.cod = endpointValue(store, handle, morphism.to);
            const cell = Nb.newFormalCell<ModelJudgment>(judgment);
            append(cell);
            return morphismHandle(shape, store, handle, cell.id, type as MorphismTypes<S>) as AddedCell<S, T>;
        },
        cells() {
            return Nb.getCells(getModelDocumentView(store, handle).notebook).map((cell) =>
                cellHandle(shape, store, handle, cell.id),
            );
        },
        cellsOf<T extends CellType<S>>(type: T) {
            return notebook.cells().filter((cell) => typeMatches(type, cell)) as AddedCell<S, T>[];
        },
        get<T extends CellType<S>>(type: T, id: string): Result<AddedCell<S, T>> {
            if (!getModelDocumentView(store, handle).notebook.cellContents[id]) {
                return { tag: "Err", content: [{ message: `No cell with id "${id}".`, path: ["id"] }] };
            }
            const cell = cellHandle(shape, store, handle, id);
            return typeMatches(type, cell)
                ? { tag: "Ok", content: cell as AddedCell<S, T> }
                : {
                      tag: "Err",
                      content: [{ message: `Cell "${id}" is not of the expected type.`, path: ["id"] }],
                  };
        },
        update(patch) {
            if (patch.title !== undefined) {
                changeModelDocument(store, handle, (document) => {
                    document.name = patch.title as string;
                });
            }
        },
        dump() {
            return store.copyValue(handle, getModelDocumentView(store, handle)) as ModelDocument;
        },
        onChange(callback) {
            return store.subscribe(handle, callback);
        },
        validate() {
            return validateDocument(store, handle);
        },
        onValidate(callback) {
            let active = true;
            let generation = 0;
            const run = async () => {
                const current = ++generation;
                const result = await validateDocument(store, handle);
                if (active && current === generation) callback(result);
            };
            queueMicrotask(() => void run());
            const unsubscribe = store.subscribe(handle, () => void run());
            return () => {
                active = false;
                unsubscribe();
            };
        },
    };
    notebookRefs.set(notebook, () => store.getDocumentRef(handle));
    return notebook;
}
