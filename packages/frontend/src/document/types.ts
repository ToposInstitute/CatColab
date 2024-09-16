import type { ModelAnalysis } from "../analysis";
import type { ModelJudgment } from "../model";
import { type Notebook, newNotebook } from "../notebook";
import type { TheoryId } from "../theory";

/** A document defining a model. */
export type ModelDocument = {
    type: "model";

    /** User-defined name of model. */
    name: string;

    /** Identifier of double theory that the model is of. */
    theory?: TheoryId;

    /** Content of the model, formal and informal. */
    notebook: Notebook<ModelJudgment>;
};

/** Create an empty model document. */
export const newModelDocument = (): ModelDocument => ({
    name: "Untitled",
    type: "model",
    notebook: newNotebook(),
});

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
    name: "Untitled",
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
