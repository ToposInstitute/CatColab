export type MarkupCell = {
    tag: "markup";
    content: string;
};

export const newMarkupCell = (): MarkupCell => ({
    tag: "markup",
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

export type Cell<T> = MarkupCell | FormalCell<T>;

export type Notebook<T> = {
    name: string;
    cells: Cell<T>[];
}
