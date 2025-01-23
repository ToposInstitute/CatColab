import { v7 } from "uuid";

import type { Uuid } from "catlog-wasm";

/** Data type for a notebook.

A notebook is nothing more than a list of cells. Any metadata associated with
notebook, such as its title, is stored elsewhere.
 */
export type Notebook<T> = {
    cells: Cell<T>[];
};

/** A cell in a notebook.

Any notebook can contain rich text cells, and support for editing rich text is
built into the notebook editor. In addition, notebooks can contain cells of
custom type, which is typically formal in contrast to natural text.
 */
export type Cell<T> = RichTextCell | FormalCell<T> | StemCell;

/** Creates an empty notebook. */
export const newNotebook = <T>(): Notebook<T> => ({
    cells: [],
});

/** A cell containing rich text. */
export type RichTextCell = {
    tag: "rich-text";
    id: Uuid;
    content: string;
};

/** Creates a rich text cell with the given content. */
export const newRichTextCell = (content?: string): RichTextCell => ({
    tag: "rich-text",
    id: v7(),
    content: content ?? "",
});

/** A cell containing custom data, usually a formal object. */
export type FormalCell<T> = {
    tag: "formal";
    id: Uuid;
    content: T;
};

/** Creates a formal cell with the given content. */
export const newFormalCell = <T>(content: T): FormalCell<T> => ({
    tag: "formal",
    id: v7(),
    content: content,
});

/** A stem cell is a placeholder which will be converted into another cell.

Stem cells are created when the user opens the "new cell" menu and are destroyed
and replaced when a type for the new cell is selected.
 */
export type StemCell = {
    tag: "stem";
    id: Uuid;
};

/** Creates a new stem cell. */
export const newStemCell = (): StemCell => ({
    tag: "stem",
    id: v7(),
});
