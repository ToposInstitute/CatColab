import type { AutomergeUrl } from "@automerge/automerge-repo";

import { Model } from "catcolab-document-methods";
import type { Document } from "catlog-wasm";

export type ModelDoc = Document & {
    type: "model";
    /** URL of the analysis document paired with this model.

    Set by the model tool when it creates the linked analysis on first open.
     */
    analysisDocUrl?: AutomergeUrl;
};

// SCHEMA

export const init = (doc: ModelDoc) => {
    Object.assign(doc, Model.newModelDocument({ theory: "empty" }));
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
