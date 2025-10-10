import type { RefStub } from "catcolab-api";
import { type LiveAnalysisDocument, getLiveAnalysis } from "../analysis";
import type { Api } from "../api";
import { type LiveDiagramDocument, getLiveDiagram } from "../diagram";
import { type LiveModelDocument, getLiveModel } from "../model";
import type { TheoryLibrary } from "../stdlib";
import type { Theory } from "../theory";
import { assertExhaustive } from "../util/assert_exhaustive";

export type AnyLiveDocument = LiveModelDocument | LiveDiagramDocument | LiveAnalysisDocument;
export type AnyLiveDocumentType = AnyLiveDocument["type"];

export function documentRefId(doc: AnyLiveDocument): string {
    // biome-ignore lint/style/noNonNullAssertion: see comment on docRef definition
    return doc.liveDoc.docRef!.refId;
}

export function getDocumentTheory(d: AnyLiveDocument): Theory | undefined {
    console.log(d);
    switch (d.type) {
        case "model":
            return d.theory();
        case "diagram":
            return d.liveModel.theory();
        case "analysis":
            switch (d.analysisType) {
                case "model":
                    return d.liveModel.theory();
                case "diagram":
                    return d.liveDiagram.liveModel.theory();
                default:
                    assertExhaustive(d);
            }
            return; // keeps biome happy
        default:
            assertExhaustive(d);
    }
}

export async function getLiveDocument(
    refId: string,
    api: Api,
    theories: TheoryLibrary,
    type: AnyLiveDocumentType,
): Promise<AnyLiveDocument> {
    switch (type) {
        case "model":
            return getLiveModel(refId, api, theories);
        case "diagram":
            return getLiveDiagram(refId, api, theories);
        case "analysis":
            return getLiveAnalysis(refId, api, theories);
        default:
            assertExhaustive(type);
    }
}

export function getLiveDocumentFromStub(
    stub: RefStub,
    api: Api,
    theories: TheoryLibrary,
): Promise<AnyLiveDocument> {
    return getLiveDocument(stub.refId, api, theories, stub.typeName as AnyLiveDocumentType);
}
