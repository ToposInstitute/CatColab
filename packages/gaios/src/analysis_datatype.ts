import { type AnalysisDocument } from "../../frontend/src/analysis";

export type AnalysisDoc = AnalysisDocument;

export const init = () => {
    // We can't create an analysis document here because it requires a model
    // GAIOS doesn't have a mechanism right now for picking another document during creation
    // as a stop gap solution we create an analysis document automatically whenever a model is created
    throw new Error("can't create analysis without a model");
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
