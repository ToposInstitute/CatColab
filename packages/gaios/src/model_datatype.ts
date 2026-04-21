import type { Document } from "catlog-wasm";
import { newModelDocument } from "../../frontend/src/model";

export type ModelDoc = Document & { type: "model" };

// SCHEMA

export const init = (doc: ModelDoc) => {
    Object.assign(doc, newModelDocument({ theory: "empty" }));
    doc.name = "New model";
};

const getTitle = (doc: ModelDoc) => doc.name;

const setTitle = (doc: ModelDoc, title: string) => {
    doc.name = title;
};

export const dataType = {
    init,
    getTitle,
    setTitle,
};
