import type { ModelAnalysis } from "../analysis";
import type { ModelJudgment } from "../model";
import type { Notebook } from "../notebook";
import type { TheoryId } from "../theory";

export type ModelDocument = {
    /** User-defined name of model. */
    name: string;

    /** Type of notebook (analysis notebook or model notebook) */
    type: "model";

    /** Identifier of double theory that the model is of. */
    theory?: TheoryId;

    /** Content of the model, formal and informal. */
    notebook: Notebook<ModelJudgment>;
};

export type ExternRef = {
    __extern__: {
        refId: string;
        taxon: string;
        via: string | null;
    };
};

export type AnalysisDocument = {
    name: string;

    type: "analysis";

    modelRef: ExternRef & { __extern__: { taxon: "analysis"; via: null } };

    notebook: Notebook<ModelAnalysis>;
};
