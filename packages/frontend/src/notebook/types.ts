import { uuidv7 } from "uuidv7";

export type Notebook<T> = {
    cells: Cell<T>[];
};

export type Cell<T> = RichTextCell | FormalCell<T>;

export const newNotebook = <T>(): Notebook<T> => ({
    cells: [],
});

export type RichTextCell = {
    tag: "rich-text";
    id: CellId;
    content: string;
};

export const newRichTextCell = (): RichTextCell => ({
    tag: "rich-text",
    id: uuidv7(),
    content: "",
});

export type FormalCell<T> = {
    tag: "formal";
    id: CellId;
    content: T;
};

export const newFormalCell = <T>(content: T): FormalCell<T> => ({
    tag: "formal",
    id: uuidv7(),
    content: content,
});

export type CellId = string;
