import { For, Show, createResource } from "solid-js";
import { getLiveAnalysis, type AnalysisDocument, type LiveAnalysisDocument } from "../analysis";
import { Api, getLiveDoc, useApi } from "../api";
import { getLiveDiagram, type DiagramDocument, type LiveDiagramDocument } from "../diagram";
import { getLiveModel, type LiveModelDocument, type ModelDocument } from "../model";
import { assertExhaustive } from "../util/assert_exhaustive";
import "./document_breadcrumbs.css";
import type { TheoryLibrary } from "../stdlib";

type AnyDocument = ModelDocument | DiagramDocument | AnalysisDocument;
export type AnyLiveDocument = LiveModelDocument | LiveDiagramDocument | LiveAnalysisDocument;
type AnyLiveDocumentType = AnyLiveDocument["type"];
type AnyDocumentWithRefId = {
    document: AnyDocument;
    refId: string;
};

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

export function DocumentBreadcrumbs(props: {
    document: AnyLiveDocument;
}) {
    const [documentChain] = createResource(() => props.document, getDocumentChain);

    return (
        <div class="breadcrumbs-wrapper">
            <Show when={documentChain()} fallback={<div />}>
                <For each={documentChain()}>
                    {(doc, index) => (
                        <>
                            {index() > 0 && <span class="breadcrumb-spacer">/</span>}
                            <a class="breadcrumb-link" href={`/${doc.document.type}/${doc.refId}`}>
                                {doc.document.name || "untitled"}
                            </a>
                        </>
                    )}
                </For>
            </Show>
        </div>
    );
}

export function getParentRefId(document: AnyDocument): string | null {
    switch (document.type) {
        case "model":
            return null;
        case "diagram":
            return document.diagramIn._id;
        case "analysis":
            return document.analysisOf._id;
        default:
            assertExhaustive(document);
    }
}

async function getDocumentChain(document: AnyLiveDocument): Promise<AnyDocumentWithRefId[]> {
    const api = useApi();
    const documentChain: AnyDocumentWithRefId[] = [
        { document: document.liveDoc.doc, refId: document.refId },
    ];

    while (true) {
        // biome-ignore lint/style/noNonNullAssertion: the array initializer guarantees that there will always be at least one item in the array
        const parentRefId = getParentRefId(documentChain[0]?.document!);
        if (!parentRefId) {
            break;
        }

        // In a worst case this results in sequential round trips to the server. However it should be
        // reasonable to hope that either the parents are already in the local automerge repo, or that
        // they will be needed by the app at some point in the near future. The alternative is picking
        // apart a JSON blob in postgres, and that sounds neither fun nor maintainable.
        const parentDocument = await getLiveDoc<AnyDocument>(api, parentRefId);
        documentChain.unshift({
            document: parentDocument.doc,
            refId: parentRefId,
        });
    }

    return documentChain;
}
