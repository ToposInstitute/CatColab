import { v7 } from "uuid";

import type { Cell, Notebook } from "catlog-wasm";

/** Creates an empty notebook. */
export const newNotebook = <T>(): Notebook<T> => ({
    cells: [],
});

/** A cell containing rich text. */
export type RichTextCell = Cell<unknown> & { tag: "rich-text" };

/** Creates a rich text cell with the given content. */
export const newRichTextCell = (content?: string): RichTextCell => ({
    tag: "rich-text",
    id: v7(),
    content: content ?? "",
});

/** A cell containing Quiver content. */
export type QuiverCell = Cell<unknown> & { tag: "quiver" };

/** Creates a quiver text cell with the given content. */
export const newQuiverCell = (content?: string): QuiverCell => ({
	tag: "quiver",
	id: v7(),
	content: content ?? "",
});

/** A cell containing custom data, usually a formal object. */
export type FormalCell<T> = Cell<T> & { tag: "formal" };

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
export type StemCell = Cell<unknown> & { tag: "stem" };

/** Creates a new stem cell. */
export const newStemCell = (): StemCell => ({
    tag: "stem",
    id: v7(),
});
