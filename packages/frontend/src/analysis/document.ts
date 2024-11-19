import invariant from "tiny-invariant";

import { type Api, type ExternRef, type LiveDoc, getLiveDoc } from "../api";
import { type LiveDiagramDocument, getLiveDiagram } from "../diagram";
import { type LiveModelDocument, getLiveModel } from "../model";
import { type Notebook, newNotebook } from "../notebook";
import type { TheoryLibrary } from "../stdlib";
import type { Analysis } from "./types";

/** Common base type for all analysis documents. */
export type BaseAnalysisDocument = {
    type: "analysis";

    /** User-defined name of analysis. */
    name: string;

    /** Reference to the document that the analysis is of. */
    analysisOf: ExternRef;

    /** Content of the analysis.

    Because each analysis comes with its own content type and Solid component,
    we do not bother to enumerate all possible analyses in a tagged union.
    This means that analysis content type is `unknown`.
     */
    notebook: Notebook<Analysis<unknown>>;
};

/** A document defining an analysis of a model. */
export type ModelAnalysisDocument = BaseAnalysisDocument & {
    analysisOf: { taxon: "model" };
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
    analysisType: "model";

    /** The ref for which this is a live document. */
    refId: string;

    /** Live document defining the analysis. */
    liveDoc: LiveDoc<ModelAnalysisDocument>;

    /** Live model that the analysis is of. */
    liveModel: LiveModelDocument;
};

/** A diagram analysis document "live" for editing. */
export type LiveDiagramAnalysisDocument = {
    analysisType: "diagram";

    /** The ref for which this is a live document. */
    refId: string;

    /** Live document defining the analysis. */
    liveDoc: LiveDoc<DiagramAnalysisDocument>;

    /** Live diagarm that the analysis is of. */
    liveDiagram: LiveDiagramDocument;
};

/** An analysis document "live" for editing. */
export type LiveAnalysisDocument = LiveModelAnalysisDocument | LiveDiagramAnalysisDocument;

/** Retrieve an analysis and make it "live" for editing. */
export async function getLiveAnalysis(
    refId: string,
    api: Api,
    theories: TheoryLibrary,
): Promise<LiveAnalysisDocument> {
    const liveDoc = await getLiveDoc<AnalysisDocument>(api, refId);
    const { doc } = liveDoc;
    invariant(doc.type === "analysis", () => `Expected analysis, got type: ${doc.type}`);

    const analysisOf = doc.analysisOf;
    if (analysisOf.taxon === "model") {
        const liveModel = await getLiveModel(analysisOf.refId, api, theories);
        return {
            analysisType: "model",
            refId,
            liveDoc: liveDoc as LiveDoc<ModelAnalysisDocument>,
            liveModel,
        };
    } else if (analysisOf.taxon === "diagram") {
        const liveDiagram = await getLiveDiagram(analysisOf.refId, api, theories);
        return {
            analysisType: "diagram",
            refId,
            liveDoc: liveDoc as LiveDoc<DiagramAnalysisDocument>,
            liveDiagram,
        };
    } else {
        throw new Error(`Analysis of unknown document: ${analysisOf}`);
    }
}
