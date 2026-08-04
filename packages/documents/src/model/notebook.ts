import { Model, Nb } from "catcolab-document-methods";
import type { ModelJudgment } from "catcolab-document-types";
import type { NotebookDocument } from "../notebook-document";
import { getRichTextCell, type RichTextCell } from "../rich-text";
import type {
    CellType,
    EndpointObjectTypes,
    MorphismType,
    MorphismTypes,
    ObjectType,
    ObjectTypes,
    RichTextType,
    Shape,
} from "../shape";
import {
    getModelCell,
    getMorphismCell,
    getObjectCell,
    obFromObjectCell,
    type Cell,
    type MorphismCell,
    type ObjectCell,
} from "./cell";
import type { ModelDocument } from "./document";

/**
 * The value given to [`Notebook.add`].
 */
type CellValuesOf<S extends Shape, T extends CellType<S>> = T extends RichTextType
    ? { content: string }
    : T extends ObjectType
      ? { label: string | null }
      : T extends MorphismType
        ? {
              label: string | null;
              from: ObjectCell<EndpointObjectTypes<S, T>> | null;
              to: ObjectCell<EndpointObjectTypes<S, T>> | null;
          }
        : never;
/**
 * The type of a cell after being added to a notebook. This resolves to a
 * [`Cell`] switched by the [`T`] [`CellType`] passed to it.
 */
type AddedCellOf<S extends Shape, T extends CellType<S>> = T extends RichTextType
    ? RichTextCell
    : T extends ObjectType
      ? ObjectCell<T>
      : T extends MorphismType
        ? MorphismCell<S, T>
        : never;

export interface Notebook<S extends Shape, D extends NotebookDocument = NotebookDocument> {
    readonly shape: S;
    readonly document: D;
    readonly title: string;

    add<T extends CellType<S>>(type: T, values: CellValuesOf<S, T>): AddedCellOf<S, T>;
    cells(): readonly Cell<S>[];
    update(patch: Partial<{ title: string }>): void;
}

export function notebookFromModel<S extends Shape, D extends ModelDocument>(
    shape: S,
    document: D,
): Notebook<S, D> {
    return {
        shape,
        document,
        get title() {
            return document.name;
        },
        add<T extends CellType<S>>(type: T, values: CellValuesOf<S, T>) {
            if (type.kind === "rich-text") {
                const richText = values as { content: string };
                const cell = Nb.newRichTextCell(richText.content);
                Nb.appendCell(document.notebook, cell);
                return getRichTextCell(document, cell.id) as AddedCellOf<S, T>;
            }

            if (type.kind === "object") {
                const object = values as { label: string | null };
                const judgment = Model.newObjectDecl(type.obType);
                judgment.name = object.label ?? "";
                const cell = Nb.newFormalCell<ModelJudgment>(judgment);
                Nb.appendCell(document.notebook, cell);
                return getObjectCell(document, cell.id, type as ObjectTypes<S>) as AddedCellOf<
                    S,
                    T
                >;
            }

            const morphism = values as CellValuesOf<S, MorphismTypes<S>>;
            const judgment = Model.newMorphismDecl(type.morType);
            judgment.name = morphism.label ?? "";
            judgment.dom = obFromObjectCell(document, morphism.from);
            judgment.cod = obFromObjectCell(document, morphism.to);
            const cell = Nb.newFormalCell<ModelJudgment>(judgment);
            Nb.appendCell(document.notebook, cell);
            return getMorphismCell(
                shape,
                document,
                cell.id,
                type as MorphismTypes<S>,
            ) as AddedCellOf<S, T>;
        },
        cells() {
            return document.notebook.cellOrder.map((cellId) =>
                getModelCell(shape, document, cellId),
            );
        },
        update(patch) {
            if (patch.title !== undefined) {
                document.name = patch.title;
            }
        },
    };
}
