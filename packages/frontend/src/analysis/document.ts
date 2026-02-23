import type { AnyDocumentId, Repo } from "@automerge/automerge-repo";

import {
    type Analysis,
    type AnalysisType,
    currentVersion,
    type Document,
    type StableRef,
    type Uuid,
} from "catlog-wasm";
import { type Api, type DocRef, findAndMigrate, type LiveDoc, makeLiveDoc } from "../api";
import { getLiveDiagram, getLiveDiagramFromRepo, type LiveDiagramDoc } from "../diagram";
import type { LiveModelDoc, ModelLibrary } from "../model";
import { NotebookUtils, newNotebook } from "../notebook";
import { assertExhaustive } from "../util/assert_exhaustive";

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

type BaseLiveAnalysisDoc = {
    /** Tag for use in tagged unions of document types. */
    type: "analysis";

    /** Type of document that this analysis is of. */
    analysisType: AnalysisType;
};

/** A model analysis document "live" for editing. */
export type LiveModelAnalysisDoc = BaseLiveAnalysisDoc & {
    analysisType: "model";

    /** Live document defining the analysis. */
    liveDoc: LiveDoc<ModelAnalysisDocument>;

    /** Live model that the analysis is of. */
    liveModel: LiveModelDoc;
};

/** A diagram analysis document "live" for editing. */
export type LiveDiagramAnalysisDoc = BaseLiveAnalysisDoc & {
    analysisType: "diagram";

    /** Live document defining the analysis. */
    liveDoc: LiveDoc<DiagramAnalysisDocument>;

    /** Live diagram that the analysis is of. */
    liveDiagram: LiveDiagramDoc;
};

/** An analysis document "live" for editing. */
export type LiveAnalysisDoc = LiveModelAnalysisDoc | LiveDiagramAnalysisDoc;

/** Create a new, empty analysis in the backend. */
export async function createAnalysis(api: Api, analysisType: AnalysisType, analysisOf: StableRef) {
    const init = newAnalysisDocument(analysisType, analysisOf);
    return api.createDoc(init);
}

export type LiveAnalysisDocWithRef = {
    liveAnalysis: LiveAnalysisDoc;
    docRef: DocRef;
};

/** Retrieve an analysis and make it "live" for editing. */
export async function getLiveAnalysis(
    refId: Uuid,
    api: Api,
    models: ModelLibrary<Uuid>,
): Promise<LiveAnalysisDocWithRef> {
    const { liveDoc, docRef } = await api.getLiveDoc<AnalysisDocument>(refId, "analysis");
    const { doc } = liveDoc;

    let liveAnalysis: LiveAnalysisDoc;
    // XXX: TypeScript cannot narrow types in nested tagged unions.
    if (doc.analysisType === "model") {
        const liveModel = await models.getLiveModel(doc.analysisOf._id);
        liveAnalysis = {
            type: "analysis",
            analysisType: "model",
            liveDoc: liveDoc as LiveDoc<ModelAnalysisDocument>,
            liveModel,
        };
    } else if (doc.analysisType === "diagram") {
        const { liveDiagram } = await getLiveDiagram(doc.analysisOf._id, api, models);
        liveAnalysis = {
            type: "analysis",
            analysisType: "diagram",
            liveDoc: liveDoc as LiveDoc<DiagramAnalysisDocument>,
            liveDiagram,
        };
    } else {
        throw new Error(`Unknown analysis type: ${doc.analysisType}`);
    }

    migrateAnalysis(liveAnalysis);
    return { liveAnalysis, docRef };
}

/** Get an analysis from an Automerge repo and make it "live" for editing.

Prefer [`getLiveAnalysis`] unless you're bypassing the official backend.
 */
export async function getLiveAnalysisFromRepo(
    docId: AnyDocumentId,
    repo: Repo,
    models: ModelLibrary<AnyDocumentId>,
): Promise<LiveAnalysisDoc> {
    const docHandle = await findAndMigrate(repo, docId);
    const liveDoc = makeLiveDoc<AnalysisDocument>(docHandle, "analysis");
    const { doc } = liveDoc;

    let liveAnalysis: LiveAnalysisDoc;
    const parentId = doc.analysisOf._id as AnyDocumentId;
    if (doc.analysisType === "model") {
        const liveModel = await models.getLiveModel(parentId);
        liveAnalysis = {
            type: "analysis",
            analysisType: "model",
            liveDoc: liveDoc as LiveDoc<ModelAnalysisDocument>,
            liveModel,
        };
    } else if (doc.analysisType === "diagram") {
        const liveDiagram = await getLiveDiagramFromRepo(parentId, repo, models);
        liveAnalysis = {
            type: "analysis",
            analysisType: "diagram",
            liveDoc: liveDoc as LiveDoc<DiagramAnalysisDocument>,
            liveDiagram,
        };
    } else {
        throw new Error(`Unknown analysis type: ${doc.analysisType}`);
    }

    migrateAnalysis(liveAnalysis);
    return liveAnalysis;
}

/** Migrate content of formal cells in analysis document.

This is a stop-gap (read: hacky) method to migrate the content of analyses when
the set of fields changes. It allow new fields to be added. Renaming or removing
existing fields is *not* supported.
 */
function migrateAnalysis(liveAnalysis: LiveAnalysisDoc) {
    const theory = theoryForLiveAnalysis(liveAnalysis);

    const getAnalysisMeta = (analysisId: string) => {
        switch (liveAnalysis.analysisType) {
            case "model":
                return theory?.modelAnalysis(analysisId);
            case "diagram":
                return theory?.diagramAnalysis(analysisId);
        }
    };

    const doc = liveAnalysis.liveDoc.doc;
    for (const cell of NotebookUtils.getFormalCells(doc.notebook)) {
        const meta = getAnalysisMeta(cell.content.id);
        if (!meta) {
            continue;
        }
        const initialContent = meta.initialContent() as Record<string, unknown>;
        for (const key in initialContent) {
            if (!(key in cell.content.content)) {
                liveAnalysis.liveDoc.changeDoc((doc) => {
                    NotebookUtils.mutateCellContentById(doc.notebook, cell.id, (content) => {
                        content.content[key] = initialContent[key];
                    });
                });
            }
        }
    }
}

/** Gets the theory associated with a live analysis. */
export function theoryForLiveAnalysis(liveAnalysis: LiveAnalysisDoc) {
    switch (liveAnalysis.analysisType) {
        case "model":
            return liveAnalysis.liveModel.theory();
        case "diagram":
            return liveAnalysis.liveDiagram.liveModel.theory();
        default:
            assertExhaustive(liveAnalysis);
    }
}
