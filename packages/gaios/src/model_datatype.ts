import type { Cell, Uuid } from "catlog-wasm";

// SCHEMA

export type ModelDoc = {
    name: string;
    theory: string;
    type: string;
    notebook: {
        cells: Cell<unknown>[];
    };
};

export const markCopy = (doc: ModelDoc) => {
    doc.name = `Copy of ${doc.name}`;
};

const setTitle = async (doc: ModelDoc, title: string) => {
    doc.name = title;
};

const getTitle = async (doc: ModelDoc) => {
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
    markCopy,
};
