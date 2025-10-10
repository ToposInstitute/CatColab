import type { AutomergeUrl, Repo } from "@automerge/automerge-repo";

import {
    type Analysis,
    type AnalysisType,
    type Document,
    type StableRef,
    currentVersion,
} from "catlog-wasm";
import { type Api, type LiveDoc, createDoc, getLiveDoc, getLiveDocFromDocHandle } from "../api";
import { type LiveDiagramDocument, getLiveDiagram, getLiveDiagramFromRepo } from "../diagram";
import { type LiveModelDocument, getLiveModel, getLiveModelFromRepo } from "../model";
import { newNotebook } from "../notebook";
import type { TheoryLibrary } from "../theory";

/** A document defining an analysis. */
export type AnalysisDocument = Document & { type: "analysis" };

/** A document defining an analysis of a model. */
export type ModelAnalysisDocument = AnalysisDocument & { analysisType: "model" };

/** A document defining an analysis of a diagram. */
export type DiagramAnalysisDocument = AnalysisDocument & { analysisType: "diagram" };

/** Create an empty analysis. */
export const newAnalysisDocument = (
    analysisType: AnalysisType,
    analysisOf: StableRef,
): AnalysisDocument => ({
    name: "",
    type: "analysis",
    analysisType,
    analysisOf: {
        ...analysisOf,
        type: "analysis-of",
    },
    notebook: newNotebook<Analysis>(),
    version: currentVersion(),
});

type BaseLiveAnalysisDocument = {
    /** Tag for use in tagged unions of document types. */
    type: "analysis";

    /** Type of document that this analysis is of. */
    analysisType: AnalysisType;
};

/** A model analysis document "live" for editing. */
export type LiveModelAnalysisDocument = BaseLiveAnalysisDocument & {
    analysisType: "model";

    /** Live document defining the analysis. */
    liveDoc: LiveDoc<ModelAnalysisDocument>;

    /** Live model that the analysis is of. */
    liveModel: LiveModelDocument;
};

/** A diagram analysis document "live" for editing. */
export type LiveDiagramAnalysisDocument = BaseLiveAnalysisDocument & {
    analysisType: "diagram";

    /** Live document defining the analysis. */
    liveDoc: LiveDoc<DiagramAnalysisDocument>;

    /** Live diagram that the analysis is of. */
    liveDiagram: LiveDiagramDocument;
};

/** An analysis document "live" for editing. */
export type LiveAnalysisDocument = LiveModelAnalysisDocument | LiveDiagramAnalysisDocument;

/** Create a new, empty analysis in the backend. */
export async function createAnalysis(api: Api, analysisType: AnalysisType, analysisOf: StableRef) {
    const init = newAnalysisDocument(analysisType, analysisOf);
    return createDoc(api, init);
}

/** Retrieve an analysis and make it "live" for editing. */
export async function getLiveAnalysis(
    refId: string,
    api: Api,
    theories: TheoryLibrary,
): Promise<LiveAnalysisDocument> {
    const liveDoc = await getLiveDoc<AnalysisDocument>(api, refId, "analysis");
    const { doc } = liveDoc;

    // XXX: TypeScript cannot narrow types in nested tagged unions.
    if (doc.analysisType === "model") {
        const liveModel = await getLiveModel(doc.analysisOf._id, api, theories);
        return {
            type: "analysis",
            analysisType: "model",
            liveDoc: liveDoc as LiveDoc<ModelAnalysisDocument>,
            liveModel,
        };
    } else if (doc.analysisType === "diagram") {
        const liveDiagram = await getLiveDiagram(doc.analysisOf._id, api, theories);
        return {
            type: "analysis",
            analysisType: "diagram",
            liveDoc: liveDoc as LiveDoc<DiagramAnalysisDocument>,
            liveDiagram,
        };
    }
    throw new Error(`Unknown analysis type: ${doc.analysisType}`);
}

/** Get an analysis from an Automerge repo and make it "live" for editing.

Prefer [`getLiveAnalysis`] unless you're bypassing the official backend.
 */
export async function getLiveAnalysisFromRepo(
    docId: AutomergeUrl,
    repo: Repo,
    theories: TheoryLibrary,
): Promise<LiveAnalysisDocument> {
    const docHandle = await repo.find<AnalysisDocument>(docId);
    const liveDoc = getLiveDocFromDocHandle(docHandle);
    const { doc } = liveDoc;

    const parentId = doc.analysisOf._id as AutomergeUrl;
    if (doc.analysisType === "model") {
        const liveModel = await getLiveModelFromRepo(parentId, repo, theories);
        return {
            type: "analysis",
            analysisType: "model",
            liveDoc: liveDoc as LiveDoc<ModelAnalysisDocument>,
            liveModel,
        };
    } else if (doc.analysisType === "diagram") {
        const liveDiagram = await getLiveDiagramFromRepo(parentId, repo, theories);
        return {
            type: "analysis",
            analysisType: "diagram",
            liveDoc: liveDoc as LiveDoc<DiagramAnalysisDocument>,
            liveDiagram,
        };
    }
    throw new Error(`Unknown analysis type: ${doc.analysisType}`);
}
