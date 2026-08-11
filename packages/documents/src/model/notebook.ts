import { Model, Nb } from "catcolab-document-methods";
import type { ModelJudgment } from "catcolab-document-types";
import type { DocumentStore } from "../document-store";
import type { NotebookDocument } from "../notebook-document";
import { getRichTextCell, type RichTextCell } from "../rich-text";
import type {
    CellTypeOf,
    CodomainObjectTypesOf,
    DomainObjectTypesOf,
    MorphismType,
    MorphismTypesOf,
    ObjectType,
    ObjectTypesOf,
    RichTextType,
    Shape,
} from "../shape";
import {
    getModelCell,
    getMorphismCell,
    getObjectCell,
    obFromObjectCell,
    type CellOf,
    type MorphismCell,
    type ObjectCell,
} from "./cell";
import type { ModelDocument } from "./document";

/**
 * The value given to [`Notebook.add`].
 */
type CellValuesOf<S extends Shape, T extends CellTypeOf<S>> = T extends RichTextType
    ? { content: string }
    : T extends ObjectType
      ? { label: string | null }
      : T extends MorphismType
        ? {
              label: string | null;
              from: ObjectCell<DomainObjectTypesOf<S, T>> | null;
              to: ObjectCell<CodomainObjectTypesOf<S, T>> | null;
          }
        : never;
/**
 * The type of a cell after being added to a notebook. This resolves to a
 * [`CellOf`] switched by the [`T`] [`CellTypeOf`] passed to it.
 */
type AddedCellOf<S extends Shape, T extends CellTypeOf<S>> = T extends RichTextType
    ? RichTextCell
    : T extends ObjectType
      ? ObjectCell<T>
      : T extends MorphismType
        ? MorphismCell<S, T>
        : never;

export interface Notebook<S extends Shape, D extends NotebookDocument = NotebookDocument> {
    readonly shape: S;
    readonly document: Readonly<D>;
    readonly title: string;

    add<T extends CellTypeOf<S>>(type: T, values: CellValuesOf<S, T>): AddedCellOf<S, T>;
    cells(): readonly CellOf<S>[];
    update(patch: Partial<{ title: string }>): void;
    dump(): D;
    onChange(callback: () => void): () => void;
}

export function modelNotebookFromStore<Handle, S extends Shape>(
    shape: S,
    store: DocumentStore<Handle>,
    handle: Handle,
): Notebook<S, ModelDocument> {
    function appendCell(
        cell: ReturnType<typeof Nb.newRichTextCell> | Nb.FormalCell<ModelJudgment>,
    ) {
        store.changeDocument(handle, (document) => {
            Nb.appendCell((document as ModelDocument).notebook, cell);
        });
    }

    return {
        shape,
        get document() {
            return store.getDocumentView(handle) as Readonly<ModelDocument>;
        },
        get title() {
            return (store.getDocumentView(handle) as Readonly<ModelDocument>).name;
        },
        add<T extends CellTypeOf<S>>(type: T, values: CellValuesOf<S, T>) {
            if (type.kind === "rich-text") {
                const richText = values as { content: string };
                const cell = Nb.newRichTextCell(richText.content);
                appendCell(cell);
                return getRichTextCell(store, handle, cell.id) as AddedCellOf<S, T>;
            }

            if (type.kind === "object") {
                const object = values as { label: string | null };
                const judgment = Model.newObjectDecl(type.obType);
                judgment.name = object.label ?? "";
                const cell = Nb.newFormalCell<ModelJudgment>(judgment);
                appendCell(cell);
                return getObjectCell(
                    store,
                    handle,
                    cell.id,
                    type as ObjectTypesOf<S>,
                ) as AddedCellOf<S, T>;
            }

            const morphism = values as CellValuesOf<S, MorphismTypesOf<S>>;
            const judgment = Model.newMorphismDecl(type.morType);
            judgment.name = morphism.label ?? "";
            const document = store.getDocumentView(handle) as Readonly<ModelDocument>;
            judgment.dom = obFromObjectCell(document, morphism.from);
            judgment.cod = obFromObjectCell(document, morphism.to);
            const cell = Nb.newFormalCell<ModelJudgment>(judgment);
            appendCell(cell);
            return getMorphismCell(
                shape,
                store,
                handle,
                cell.id,
                type as MorphismTypesOf<S>,
            ) as AddedCellOf<S, T>;
        },
        cells() {
            const document = store.getDocumentView(handle) as Readonly<ModelDocument>;
            return document.notebook.cellOrder.map((cellId) =>
                getModelCell(shape, store, handle, cellId),
            );
        },
        update(patch) {
            if (patch.title !== undefined) {
                store.changeDocument(handle, (document) => {
                    (document as ModelDocument).name = patch.title as string;
                });
            }
        },
        dump() {
            const document = store.getDocumentView(handle) as Readonly<ModelDocument>;
            return store.copyValue(handle, document) as ModelDocument;
        },
        onChange(callback) {
            return store.subscribe(handle, callback);
        },
    };
}
