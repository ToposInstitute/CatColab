import { type Notebook, newNotebook } from "../notebook";
import type { ModelAnalysis } from "./types";

/** A document defining an analysis of a model. */
export type AnalysisDocument = {
    type: "analysis";

    /** User-defined name of analysis. */
    name: string;

    /** Reference to the model that the analysis is of. */
    modelRef: ExternRef & { __extern__: { taxon: "analysis"; via: null } };

    /** Content of the analysis. */
    notebook: Notebook<ModelAnalysis>;
};

/** Create an empty analysis of a model. */
export const newAnalysisDocument = (modelRefId: string): AnalysisDocument => ({
    name: "",
    type: "analysis",
    modelRef: {
        __extern__: {
            refId: modelRefId,
            taxon: "analysis",
            via: null,
        },
    },
    notebook: newNotebook(),
});

/** A reference in a document to another document. */
export type ExternRef = {
    __extern__: {
        refId: string;
        taxon: string;
        via: string | null;
    };
};
