import { For, Show, createResource } from "solid-js";
import invariant from "tiny-invariant";

import type { Document } from "catlog-wasm";
import { type LiveDoc, useApi } from "../api";
import { assertExhaustive } from "../util/assert_exhaustive";
import "./document_breadcrumbs.css";

export function DocumentBreadcrumbs(props: {
    liveDoc: LiveDoc;
}) {
    const [documentChain] = createResource(() => props.liveDoc, getDocumentChain);

    return (
        <div class="breadcrumbs-wrapper">
            <Show when={documentChain()} fallback={<div />}>
                <For each={documentChain()}>
                    {(doc, index) => (
                        <>
                            {index() > 0 && <span class="breadcrumb-spacer">/</span>}
                            <a
                                class="breadcrumb-link"
                                href={`/${doc.doc.type}/${doc.docRef?.refId}`}
                            >
                                {doc.doc.name || "untitled"}
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

async function getDocumentChain(document: LiveDoc): Promise<LiveDoc[]> {
    invariant(document.docRef, "Document should have a ref ID");

    const api = useApi();
    const documentChain: LiveDoc[] = [document];

    while (true) {
        // biome-ignore lint/style/noNonNullAssertion: the array initializer guarantees that there will always be at least one item in the array
        const parentRefId = getParentRefId(documentChain[0]!.doc);
        if (!parentRefId) {
            break;
        }

        const parentDocument = await api.getLiveDoc(parentRefId);
        documentChain.unshift(parentDocument);
    }

    return documentChain;
}
