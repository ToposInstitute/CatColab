import type { ExternRef, LiveDoc } from "../api";
import type { LiveModelDocument } from "../model";
import { type Notebook, newNotebook } from "../notebook";
import type { ModelAnalysis } from "./types";

/** A document defining an analysis of a model. */
export type AnalysisDocument = {
    type: "analysis";

    /** User-defined name of analysis. */
    name: string;

    /** Reference to the model that the analysis is of. */
    modelRef: ExternRef & { taxon: "model" };

    /** Content of the analysis. */
    notebook: Notebook<ModelAnalysis>;
};

/** Create an empty analysis of a model. */
export const newAnalysisDocument = (modelRefId: string): AnalysisDocument => ({
    name: "",
    type: "analysis",
    modelRef: {
        tag: "extern-ref",
        refId: modelRefId,
        taxon: "model",
    },
    notebook: newNotebook(),
});

/** An analysis document "live" for editing.
 */
export type LiveAnalysisDocument = {
    /** The ref for which this is a live document. */
    refId: string;

    /** Live document with the analysis data. */
    liveDoc: LiveDoc<AnalysisDocument>;

    /** Live model that the analysis is of. */
    liveModel: LiveModelDocument;
};
