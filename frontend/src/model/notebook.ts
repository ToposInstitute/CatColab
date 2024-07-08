export type RichTextCell = {
    tag: "rich-text";
    content: string;
};

export const newRichTextCell = (): RichTextCell => ({
    tag: "rich-text",
    content: "",
});

export type FormalCell<T> = {
    tag: "formal";
    content: T;
};

export const newFormalCell = <T>(content: T): FormalCell<T> => ({
    tag: "formal",
    content: content,
});

export type Cell<T> = RichTextCell | FormalCell<T>;

export type Notebook<T> = {
    name: string;
    cells: Cell<T>[];
}
