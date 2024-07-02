export type MarkupCell = {
    tag: "markup";
    content: string;
};

export type FormalCell<T> = {
    tag: "formal";
    content: T;
};

export type Cell<T> = MarkupCell | FormalCell<T>;

export type Notebook<T> = {
    name: string;
    cells: Cell<T>[];
}
