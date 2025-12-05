import { createResource, For, Show } from "solid-js";

import type { Document } from "catlog-wasm";
import { type LiveDoc, type LiveDocWithRef, useApi } from "../api";
import { assertExhaustive } from "../util/assert_exhaustive";
import "./document_breadcrumbs.css";

export function DocumentBreadcrumbs(props: { liveDoc: LiveDoc; docRefId: string }) {
    const [documentChain] = createResource(
        () => ({ liveDoc: props.liveDoc, docRefId: props.docRefId }),
        getDocumentChain,
    );

    return (
        <div class="breadcrumbs-wrapper">
            <Show when={documentChain()} fallback={<div />}>
                <For each={documentChain()}>
                    {(doc, index) => (
                        <>
                            {index() > 0 && <span class="breadcrumb-spacer">/</span>}
                            <a
                                class="breadcrumb-link"
                                href={`/${doc.liveDoc.doc.type}/${doc.docRef.refId}`}
                            >
                                {doc.liveDoc.doc.name || "Untitled"}
                            </a>
                        </>
                    )}
                </For>
            </Show>
        </div>
    );
}

export function getParentRefId(document: Document): string | null {
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

async function getDocumentChain(props: {
    liveDoc: LiveDoc;
    docRefId: string;
}): Promise<LiveDocWithRef[]> {
    const api = useApi();
    // We need to fetch the full document to get proper permissions
    const firstDoc = await api.getLiveDoc(props.docRefId);
    const documentChain: LiveDocWithRef[] = [firstDoc];

    while (true) {
        // biome-ignore lint/style/noNonNullAssertion: the array initializer guarantees that there will always be at least one item in the array
        const parentRefId = getParentRefId(documentChain[0]!.liveDoc.doc);
        if (!parentRefId) {
            break;
        }

        const parentDocument = await api.getLiveDoc(parentRefId);
        documentChain.unshift(parentDocument);
    }

    return documentChain;
}
