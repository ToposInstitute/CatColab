import { useNavigate } from "@solidjs/router";
import type { Link } from "catlog-wasm";
import { For } from "solid-js";
import { Show } from "solid-js";
import { createResource } from "solid-js";
import invariant from "tiny-invariant";

import { type Api, type LiveDoc, useApi } from "../api";
import { DocumentMenu } from "./document_menu";
import { DocumentTypeIcon } from "./document_type_icon";
import { AppMenu, ImportMenuItem, NewModelItem } from "./menubar";

export function DocumentSidebar(props: {
    liveDoc: LiveDoc;
}) {
    return (
        <>
            <AppMenu>
                <NewModelItem />
                <ImportMenuItem />
            </AppMenu>
            <RelatedDocuments liveDoc={props.liveDoc} />
        </>
    );
}

async function getLiveDocRoot(livDoc: LiveDoc, api: Api): Promise<LiveDoc> {
    let parentLink: Link;
    switch (livDoc.doc.type) {
        case "diagram":
            parentLink = livDoc.doc.diagramIn;
            break;
        case "analysis":
            parentLink = livDoc.doc.analysisOf;
            break;
        default:
            return livDoc;
    }

    const parentDoc = await api.getLiveDocFromLink(parentLink);
    return getLiveDocRoot(parentDoc, api);
}

function RelatedDocuments(props: {
    liveDoc: LiveDoc;
}) {
    const api = useApi();

    const [liveDocRoot] = createResource(
        () => props.liveDoc,
        async (liveDoc) => getLiveDocRoot(liveDoc, api),
    );

    return (
        <Show when={liveDocRoot()} fallback={<div>Loading related items...</div>}>
            {(liveDocRoot) => (
                <div class="related-tree">
                    <DocumentsTreeNode
                        liveDoc={liveDocRoot()}
                        indent={1}
                        currentLiveDoc={props.liveDoc}
                    />
                </div>
            )}
        </Show>
    );
}

function DocumentsTreeNode(props: {
    liveDoc: LiveDoc;
    indent: number;
    currentLiveDoc: LiveDoc;
}) {
    const api = useApi();

    const [childDocs, { refetch }] = createResource(
        () => props.liveDoc,
        async (liveDoc) => {
            const docRefId = liveDoc.docRef?.refId;
            invariant(docRefId, "Doc must have a valid ref");

            const results = await api.rpc.get_ref_children_stubs.query(docRefId);

            if (results.tag !== "Ok") {
                throw new Error("couldn't load child documents!");
            }

            return await Promise.all(
                results.content.map((childStub) => api.getLiveDoc(childStub.refId)),
            );
        },
    );

    return (
        <>
            <DocumentsTreeLeaf
                liveDoc={props.liveDoc}
                indent={props.indent}
                currentLiveDoc={props.currentLiveDoc}
                triggerRefresh={refetch}
            />
            <Show when={childDocs()} fallback={<div>Loading children...</div>}>
                {(childDocs) => (
                    <For each={childDocs()}>
                        {(child) => (
                            <DocumentsTreeNode
                                liveDoc={child}
                                indent={props.indent + 1}
                                currentLiveDoc={props.currentLiveDoc}
                            />
                        )}
                    </For>
                )}
            </Show>
        </>
    );
}

function DocumentsTreeLeaf(props: {
    liveDoc: LiveDoc;
    indent: number;
    currentLiveDoc: LiveDoc;
    triggerRefresh: () => void;
}) {
    const navigate = useNavigate();

    const handleClick = () => {
        navigate(`/${createLinkPart(props.currentLiveDoc)}/${createLinkPart(props.liveDoc)}`);
    };

    return (
        <div
            onClick={handleClick}
            class="related-document"
            classList={{
                active: props.liveDoc.docRef?.refId === props.currentLiveDoc.docRef?.refId,
            }}
            style={{ "padding-left": `${props.indent * 16}px` }}
        >
            <DocumentTypeIcon documentType={props.liveDoc.doc.type} />
            <div class="document-name">{props.liveDoc.doc.name || "Untitled"}</div>
            <div class="document-actions" onClick={(e) => e.stopPropagation()}>
                <DocumentMenu liveDoc={props.liveDoc} onDocumentCreated={props.triggerRefresh} />
            </div>
        </div>
    );
}

function createLinkPart(liveDoc: LiveDoc): string {
    return `${liveDoc.doc.type}/${liveDoc.docRef?.refId}`;
}
