import { For, Show, createResource } from "solid-js";
import type { AnalysisDocument, LiveAnalysisDocument } from "../analysis";
import { getLiveDoc, useApi } from "../api";
import type { DiagramDocument, LiveDiagramDocument } from "../diagram";
import type { LiveModelDocument, ModelDocument } from "../model";
import { assertExhaustive } from "../util/assert_exhaustive";
import "./document_breadcrumbs.css";

type AnyDocument = ModelDocument | DiagramDocument | AnalysisDocument;
type AnyLiveDocument = LiveModelDocument | LiveDiagramDocument | LiveAnalysisDocument;
// the initializer { ...document, refId: "uuid" } breaks the reactivity of the document
type AnyDocumentWithRefId = AnyDocument & { refId: string };

export function DocumentBreadcrumbs(props: {
    document: AnyLiveDocument;
}) {
    const [documentChain] = createResource(() => props.document, getDocumentChain);

    return (
        <div>
            <Show when={documentChain()} fallback={<span>Loading...</span>}>
                <ol>
                    <For each={documentChain()}>
                        {(doc, index) => (
                            <>
                                {index() > 0 && <span class="breadcrumb-spacer">/</span>}
                                <a class="breadcrumb-link" href={getUrlForDocument(doc)}>
                                    [{doc.type}] {doc.name || "untitled"}
                                </a>
                            </>
                        )}
                    </For>
                </ol>
            </Show>
        </div>
    );
}

function getUrlForDocument(document: AnyDocumentWithRefId): string {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port;
    return `${protocol}//${hostname}:${port}/${document.type}/${document.refId}`;
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
        { ...document.liveDoc.doc, refId: document.refId },
    ];

    while (true) {
        // biome-ignore lint/style/noNonNullAssertion: the array initializer guarantees that there will always be at least one item in the array
        const parentRefId = getParentRefId(documentChain[0]!);
        if (!parentRefId) {
            break;
        }

        // In a worst case this results in sequential round trips to the server. However it should be
        // reasonable to hope that either the parents are already in the local automerge repo, or that
        // they will be needed by the app at some point in the near future. The alternative is picking
        // apart a JSON blob in postgres, and that sounds neither fun nor maintainable.
        const parentDocument = await getLiveDoc<AnyDocument>(api, parentRefId);
        documentChain.unshift({
            ...parentDocument.doc,
            refId: parentRefId,
        });
    }

    return documentChain;
}
