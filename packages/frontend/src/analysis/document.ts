import invariant from "tiny-invariant";

import type { JsonValue } from "catcolab-api";
import { type Api, type Document, type Link, type LiveDoc, getLiveDoc } from "../api";
import { type LiveDiagramDocument, getLiveDiagram } from "../diagram";
import { type LiveModelDocument, getLiveModel } from "../model";
import { type Notebook, newNotebook } from "../notebook";
import type { TheoryLibrary } from "../stdlib";
import type { Analysis } from "./types";

type AnalysisType = "model" | "diagram";

/** Common base type for all analysis documents. */
export type BaseAnalysisDocument<T extends AnalysisType> = Document<"analysis"> & {
    /** Type of document that the analysis is of. */
    analysisType: T;

    /** Link to the document that the analysis is of. */
    analysisOf: Link<"analysis-of">;

    /** Content of the analysis.

    Because each analysis comes with its own content type and Solid component,
    we do not bother to enumerate all possible analyses in a tagged union.
    This means that analysis content type is `unknown`.
     */
    notebook: Notebook<Analysis<unknown>>;
};

/** A document defining an analysis of a model. */
export type ModelAnalysisDocument = BaseAnalysisDocument<"model">;

/** A document defining an analysis of a diagram. */
export type DiagramAnalysisDocument = BaseAnalysisDocument<"diagram">;

/** A document defining an analysis. */
export type AnalysisDocument = ModelAnalysisDocument | DiagramAnalysisDocument;

/** Create an empty analysis. */
export const newAnalysisDocument = (
    analysisType: AnalysisType,
    refId: string,
): BaseAnalysisDocument<typeof analysisType> => ({
    name: "",
    type: "analysis",
    analysisType,
    analysisOf: {
        _id: refId,
        _version: null,
        type: "analysis-of",
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

/** Create a new analysis in the backend. */
export async function createAnalysis(type: AnalysisType, ofRefId: string, api: Api) {
    const init = newAnalysisDocument(type, ofRefId);

    const result = await api.rpc.new_ref.mutate(init as JsonValue);
    invariant(result.tag === "Ok", "Failed to create a new analysis");

    return result.content;
}

/** Retrieve an analysis and make it "live" for editing. */
export async function getLiveAnalysis(
    refId: string,
    api: Api,
    theories: TheoryLibrary,
): Promise<LiveAnalysisDocument> {
    const liveDoc = await getLiveDoc<AnalysisDocument>(api, refId, "analysis");
    const { doc } = liveDoc;

    if (doc.analysisType === "model") {
        const liveModel = await getLiveModel(doc.analysisOf._id, api, theories);
        return {
            analysisType: "model",
            refId,
            liveDoc: liveDoc as LiveDoc<ModelAnalysisDocument>,
            liveModel,
        };
    } else if (doc.analysisType === "diagram") {
        const liveDiagram = await getLiveDiagram(doc.analysisOf._id, api, theories);
        return {
            analysisType: "diagram",
            refId,
            liveDoc: liveDoc as LiveDoc<DiagramAnalysisDocument>,
            liveDiagram,
        };
    }
    throw new Error(`Unknown analysis type: ${(doc as AnalysisDocument).analysisType}`);
}
