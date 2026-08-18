import { Model, Nb } from "catcolab-document-methods";
import type { ModelJudgment } from "catcolab-document-types";
import type { DocumentStore } from "../document-store";
import type { NotebookDocument } from "../notebook-document";
import { getRichTextCell, type RichTextCell } from "../rich-text";
import type {
    AnyCellType,
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
import { morphismTypesEqual, objectTypesEqual } from "./equality";

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

function isCellType(value: AnyCellType | Shape): value is AnyCellType {
    return "kind" in value;
}

function shapeSupportsCell(shape: Shape, type: AnyCellType): boolean {
    switch (type.kind) {
        case "rich-text":
            return true;
        case "object":
            if (shape.objects === undefined) {
                return false;
            }
            for (const candidate of shape.objects) {
                if (objectTypesEqual(candidate.obType, type.obType)) {
                    return true;
                }
            }
            return false;
        case "morphism":
            if (shape.morphisms === undefined) {
                return false;
            }
            for (const candidate of shape.morphisms) {
                if (morphismTypesEqual(candidate.morType, type.morType)) {
                    return true;
                }
            }
            return false;
    }
}

function shapeSupportsShape(shape: Shape, required: Shape): boolean {
    if (required.objects !== undefined) {
        for (const type of required.objects) {
            if (!shapeSupportsCell(shape, type)) {
                return false;
            }
        }
    }

    if (required.morphisms !== undefined) {
        for (const type of required.morphisms) {
            if (!shapeSupportsCell(shape, type)) {
                return false;
            }
        }
    }

    if (required.informal !== undefined) {
        for (const type of required.informal) {
            if (!shapeSupportsCell(shape, type)) {
                return false;
            }
        }
    }

    return true;
}

function cellMatchesFilter<S extends Shape>(cell: CellOf<S>, filter: AnyCellType | Shape): boolean {
    if (isCellType(filter)) {
        switch (filter.kind) {
            case "rich-text":
                return cell.kind === "rich-text";
            case "object":
                if (cell.kind !== "object") {
                    return false;
                }
                return objectTypesEqual(cell.type.obType, filter.obType);
            case "morphism":
                if (cell.kind !== "morphism") {
                    return false;
                }
                return morphismTypesEqual(cell.type.morType, filter.morType);
        }
    }

    switch (cell.kind) {
        case "rich-text":
            if (filter.informal === undefined) {
                return false;
            }
            return filter.informal.length > 0;
        case "object":
            if (filter.objects === undefined) {
                return false;
            }
            for (const type of filter.objects) {
                if (objectTypesEqual(cell.type.obType, type.obType)) {
                    return true;
                }
            }
            return false;
        case "morphism":
            if (filter.morphisms === undefined) {
                return false;
            }
            for (const type of filter.morphisms) {
                if (morphismTypesEqual(cell.type.morType, type.morType)) {
                    return true;
                }
            }
            return false;
    }
}

export interface Notebook<S extends Shape, D extends NotebookDocument = NotebookDocument> {
    readonly shape: S;
    readonly document: Readonly<D>;
    readonly title: string;

    add<T extends CellTypeOf<S>>(type: T, values: CellValuesOf<S, T>): AddedCellOf<S, T>;
    cells(): readonly CellOf<S>[];
    cellsOf(typeOrShape: AnyCellType | Shape): readonly CellOf<S>[];
    supports(typeOrShape: AnyCellType | Shape): boolean;
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
        cellsOf(filter: AnyCellType | Shape) {
            return this.cells().filter((cell) => cellMatchesFilter(cell, filter));
        },
        supports(filter) {
            if (isCellType(filter)) {
                return shapeSupportsCell(shape, filter);
            }
            return shapeSupportsShape(shape, filter);
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
