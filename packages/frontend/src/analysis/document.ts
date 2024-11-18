import type { ExternRef, LiveDoc } from "../api";
import type { LiveDiagramDocument } from "../diagram";
import type { LiveModelDocument } from "../model";
import { type Notebook, newNotebook } from "../notebook";
import type { ModelAnalysis } from "./types";

/** Common base type for all analysis documents. */
export type BaseAnalysisDocument = {
    type: "analysis";

    /** User-defined name of analysis. */
    name: string;

    /** Reference to the document that the analysis is of. */
    analysisOf: ExternRef;

    /** Content of the analysis. */
    notebook: Notebook<unknown>;
};

/** A document defining an analysis of a model. */
export type ModelAnalysisDocument = BaseAnalysisDocument & {
    analysisOf: { taxon: "model" };
    notebook: Notebook<ModelAnalysis>;
};

/** A document defining an analysis of a diagram. */
export type DiagramAnalysisDocument = BaseAnalysisDocument & {
    analysisOf: { taxon: "diagram" };
};

/** A document defining an analysis. */
export type AnalysisDocument = ModelAnalysisDocument | DiagramAnalysisDocument;

/** Create an empty model analysis. */
export const newModelAnalysisDocument = (refId: string): ModelAnalysisDocument => ({
    name: "",
    type: "analysis",
    analysisOf: {
        tag: "extern-ref",
        refId,
        taxon: "model",
    },
    notebook: newNotebook(),
});

/** Create an empty diagram analysis. */
export const newDiagramAnalysisDocument = (refId: string): DiagramAnalysisDocument => ({
    name: "",
    type: "analysis",
    analysisOf: {
        tag: "extern-ref",
        refId,
        taxon: "diagram",
    },
    notebook: newNotebook(),
});

/** A model analysis document "live" for editing. */
export type LiveModelAnalysisDocument = {
    /** The ref for which this is a live document. */
    refId: string;

    /** Live document defining the analysis. */
    liveDoc: LiveDoc<ModelAnalysisDocument>;

    /** Live model that the analysis is of. */
    liveModel: LiveModelDocument;
};

/** A diagram analysis document "live" for editing. */
export type LiveDiagramAnalysisDocument = {
    /** The ref for which this is a live document. */
    refId: string;

    /** Live document defining the analysis. */
    liveDoc: LiveDoc<DiagramAnalysisDocument>;

    /** Live diagarm that the analysis is of. */
    liveDiagram: LiveDiagramDocument;
};
