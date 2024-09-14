import type { ModelAnalysis } from "../analysis";
import type { ModelJudgment } from "../model";
import type { Notebook } from "../notebook";
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

/** A reference in a document to another document. */
export type ExternRef = {
    __extern__: {
        refId: string;
        taxon: string;
        via: string | null;
    };
};
