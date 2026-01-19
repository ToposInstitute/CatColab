import type { Notebook } from "catlog-wasm";

// SCHEMA

export type ModelDoc = {
    name: string;
    theory: string;
    type: string;
    notebook: Notebook<unknown>;
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
        cellOrder: [],
        cellContents: {},
    };
};

export const dataType = {
    init,
    getTitle,
    setTitle,
};
