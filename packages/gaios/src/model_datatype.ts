import type { Cell } from "catlog-wasm";

// SCHEMA

export type ModelDoc = {
    name: string;
    theory: string;
    type: string;
    notebook: {
        cells: Cell<unknown>[];
    };
};

const setTitle = (doc: ModelDoc, title: string) => {
    doc.name = title;
};

const getTitle = (doc: ModelDoc) => {
    return doc.name || "CatColab Model";
};

export const init = (doc: ModelDoc) => {
    doc.name = "CatColab Model";
    doc.theory = "simple-olog";
    doc.type = "model";
    doc.notebook = {
        cells: [],
    };
};

export const dataType = {
    init,
    getTitle,
    setTitle,
};
