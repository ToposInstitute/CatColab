import invariant from "tiny-invariant";

import type { Document } from "catlog-wasm";
import { type Api, type LiveDoc, type StableRef, getLiveDoc } from "../api";
import { type LiveDiagramDocument, getLiveDiagram } from "../diagram";
import { type LiveModelDocument, getLiveModel } from "../model";
import { newNotebook } from "../notebook";
import type { TheoryLibrary } from "../stdlib";
import type { InterfaceToType } from "../util/types";

type AnalysisType = "model" | "diagram";

type BaseAnalysisDocument<T extends AnalysisType> = Document & {
    type: "analysis";
    analysisType: T;
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
    analysisOf: StableRef,
): BaseAnalysisDocument<typeof analysisType> => ({
    name: "",
    type: "analysis",
    analysisType,
    analysisOf: {
        ...analysisOf,
        type: "analysis-of",
    },
    notebook: newNotebook(),
});

/** A model analysis document "live" for editing. */
export type LiveModelAnalysisDocument = {
    type: "analysis";
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
    type: "analysis";
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

/** Create a new, empty analysis in the backend. */
export async function createAnalysis(api: Api, analysisType: AnalysisType, analysisOf: StableRef) {
    const init = newAnalysisDocument(analysisType, analysisOf);

    const result = await api.rpc.new_ref.mutate(init as InterfaceToType<AnalysisDocument>);
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
            type: "analysis",
            analysisType: "model",
            refId,
            liveDoc: liveDoc as LiveDoc<ModelAnalysisDocument>,
            liveModel,
        };
    } else if (doc.analysisType === "diagram") {
        const liveDiagram = await getLiveDiagram(doc.analysisOf._id, api, theories);
        return {
            type: "analysis",
            analysisType: "diagram",
            refId,
            liveDoc: liveDoc as LiveDoc<DiagramAnalysisDocument>,
            liveDiagram,
        };
    }
    throw new Error(`Unknown analysis type: ${(doc as AnalysisDocument).analysisType}`);
}
