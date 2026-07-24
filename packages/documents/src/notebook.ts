import { Model, Nb } from "catcolab-document-methods";
import type { ModelJudgment } from "catcolab-document-types";
import {
    cellHandle,
    endpointValue,
    morphismHandle,
    objectHandle,
    richTextHandle,
    type Cell,
    type MorphismCell,
    type ObjectCell,
    type RichTextCell,
} from "./cell";
import type { ModelDocument } from "./model-document";
import type { NotebookDocument } from "./notebook-document";
import type {
    CellType,
    EndpointObjectTypes,
    MorphismType,
    MorphismTypes,
    ObjectType,
    ObjectTypes,
    RichTextType,
    Shape,
} from "./shape";

/**
 * The value given to [`Notebook.add`].
 */
type AddValue<S extends Shape, T extends CellType<S>> = T extends RichTextType
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
type AddedCell<S extends Shape, T extends CellType<S>> = T extends RichTextType
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

    add<T extends CellType<S>>(type: T, value: AddValue<S, T>): AddedCell<S, T>;
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
        add<T extends CellType<S>>(type: T, value: AddValue<S, T>) {
            if (type.kind === "rich-text") {
                const richText = value as { content: string };
                const cell = Nb.newRichTextCell(richText.content);
                Nb.appendCell(document.notebook, cell);
                return richTextHandle(document, cell.id) as AddedCell<S, T>;
            }

            if (type.kind === "object") {
                const object = value as { label: string | null };
                const judgment = Model.newObjectDecl(type.obType);
                judgment.name = object.label ?? "";
                const cell = Nb.newFormalCell<ModelJudgment>(judgment);
                Nb.appendCell(document.notebook, cell);
                return objectHandle(document, cell.id, type as ObjectTypes<S>) as AddedCell<S, T>;
            }

            const morphism = value as AddValue<S, MorphismTypes<S>>;
            const judgment = Model.newMorphismDecl(type.morType);
            judgment.name = morphism.label ?? "";
            judgment.dom = endpointValue(document, morphism.from);
            judgment.cod = endpointValue(document, morphism.to);
            const cell = Nb.newFormalCell<ModelJudgment>(judgment);
            Nb.appendCell(document.notebook, cell);
            return morphismHandle(shape, document, cell.id, type as MorphismTypes<S>) as AddedCell<
                S,
                T
            >;
        },
        cells() {
            return document.notebook.cellOrder.map((cellId) => cellHandle(shape, document, cellId));
        },
        update(patch) {
            if (patch.title !== undefined) {
                document.name = patch.title;
            }
        },
    };
}
