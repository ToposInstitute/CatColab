import { v7 } from "uuid";

import type { Cell, Notebook } from "catcolab-document-types";

export type FormalCell<T> = Cell<T> & { tag: "formal" };

/** Automerge-backed rich text stored directly at a cell's content path. */
export type RichTextContent = string;

export type RichTextCell = Omit<Cell<unknown> & { tag: "rich-text" }, "content"> & {
    content: RichTextContent;
};

export const newNotebook = <T>(): Notebook<T> => ({
    cellOrder: [],
    cellContents: {},
});

export const newRichTextCell = (content?: RichTextContent): RichTextCell => ({
    tag: "rich-text",
    id: v7(),
    content: content ?? "",
});

export const newFormalCell = <T>(content: T): FormalCell<T> => ({
    tag: "formal",
    id: v7(),
    content,
});

export function duplicateCell<T>(cell: Cell<T>, duplicateFn?: (content: T) => T): Cell<T> {
    switch (cell.tag) {
        case "formal": {
            const content = duplicateFn ? duplicateFn(cell.content) : structuredClone(cell.content);
            return newFormalCell(content);
        }
        case "rich-text":
            throw new Error("Rich text cells may not be duplicated");
        default:
            throw new Error(`Cell has unknown tag: ${String(cell)}`);
    }
}
