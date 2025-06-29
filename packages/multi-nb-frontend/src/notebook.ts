export type Uuid = string;

export type Notebook = {
    title: string;
    cellContent: Record<Uuid, string>;
    order: Uuid[];
};

export function newNotebook(): Notebook {
    return {
        title: "",
        cellContent: {},
        order: [],
    };
}
