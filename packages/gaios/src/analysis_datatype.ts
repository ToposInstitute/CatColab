import { type AnalysisDocument, newAnalysisDocument } from "../../frontend/src/analysis";

export type AnalysisDoc = AnalysisDocument;

// SCHEMA

// Analyses are normally created fully formed by the model tool, which pairs
// every model with an analysis and knows which model to reference. This init
// only runs if a bare analysis document is created some other way; the tool
// then shows an error because the empty `analysisOf` reference cannot be
// resolved.
export const init = (doc: AnalysisDoc) => {
    Object.assign(doc, newAnalysisDocument("model", { _id: "", _version: null, _server: "" }));
};

const getTitle = (doc: AnalysisDoc) => doc.name || "Analysis";

const setTitle = (doc: AnalysisDoc, title: string) => {
    doc.name = title;
};

export const dataType = {
    init,
    getTitle,
    setTitle,
};
