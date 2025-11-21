import { useNavigate } from "@solidjs/router";
import { createMemo, createResource, For, Show } from "solid-js";
import invariant from "tiny-invariant";

import { DocumentTypeIcon } from "catcolab-ui-components";
import type { Link } from "catlog-wasm";
import { type Api, type LiveDocWithRef, useApi } from "../api";
import { DocumentMenu } from "./document_menu";

export function DocumentSidebar(props: {
    primaryDoc?: LiveDocWithRef;
    secondaryDoc?: LiveDocWithRef;
    refetchPrimaryDoc: () => void;
    refetchSecondaryDoc: () => void;
}) {
    return (
        <Show when={props.primaryDoc}>
            {(primaryDoc) => (
                <RelatedDocuments
                    primaryDoc={primaryDoc()}
                    secondaryDoc={props.secondaryDoc}
                    refetchPrimaryDoc={props.refetchPrimaryDoc}
                    refetchSecondaryDoc={props.refetchSecondaryDoc}
                />
            )}
        </Show>
    );
}

async function getLiveDocRoot(doc: LiveDocWithRef, api: Api): Promise<LiveDocWithRef> {
    let parentLink: Link;
    switch (doc.liveDoc.doc.type) {
        case "diagram":
            parentLink = doc.liveDoc.doc.diagramIn;
            break;
        case "analysis":
            parentLink = doc.liveDoc.doc.analysisOf;
            break;
        default:
            return doc;
    }

    const parentDoc = await api.getLiveDoc(parentLink._id);
    return getLiveDocRoot(parentDoc, api);
}

function RelatedDocuments(props: {
    primaryDoc: LiveDocWithRef;
    secondaryDoc?: LiveDocWithRef;
    refetchPrimaryDoc: () => void;
    refetchSecondaryDoc: () => void;
}) {
    const api = useApi();

    const [docRoot] = createResource(
        () => props.primaryDoc,
        async (doc) => getLiveDocRoot(doc, api),
    );

    return (
        <Show when={docRoot()}>
            {(docRoot) => (
                <div class="related-tree">
                    <DocumentsTreeNode
                        doc={docRoot()}
                        indent={1}
                        primaryDoc={props.primaryDoc}
                        secondaryDoc={props.secondaryDoc}
                        refetchPrimaryDoc={props.refetchPrimaryDoc}
                        refetchSecondaryDoc={props.refetchSecondaryDoc}
                    />
                </div>
            )}
        </Show>
    );
}

function DocumentsTreeNode(props: {
    doc: LiveDocWithRef;
    indent: number;
    primaryDoc: LiveDocWithRef;
    secondaryDoc?: LiveDocWithRef;
    refetchPrimaryDoc: () => void;
    refetchSecondaryDoc: () => void;
}) {
    const api = useApi();

    const [childDocs, { refetch }] = createResource(
        () => props.doc,
        async (doc) => {
            const docRefId = doc.docRef.refId;
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
                doc={props.doc}
                indent={props.indent}
                primaryDoc={props.primaryDoc}
                secondaryDoc={props.secondaryDoc}
                refetchDoc={refetch}
                refetchPrimaryDoc={props.refetchPrimaryDoc}
                refetchSecondaryDoc={props.refetchSecondaryDoc}
            />
            <For each={childDocs()}>
                {(child) => (
                    <DocumentsTreeNode
                        doc={child}
                        indent={props.indent + 1}
                        primaryDoc={props.primaryDoc}
                        secondaryDoc={props.secondaryDoc}
                        refetchPrimaryDoc={props.refetchPrimaryDoc}
                        refetchSecondaryDoc={props.refetchSecondaryDoc}
                    />
                )}
            </For>
        </>
    );
}

function DocumentsTreeLeaf(props: {
    doc: LiveDocWithRef;
    indent: number;
    primaryDoc: LiveDocWithRef;
    secondaryDoc?: LiveDocWithRef;
    refetchDoc: () => void;
    refetchPrimaryDoc: () => void;
    refetchSecondaryDoc: () => void;
}) {
    const navigate = useNavigate();
    const clickedRefId = createMemo(() => props.doc.docRef.refId);
    const primaryRefId = createMemo(() => props.primaryDoc.docRef.refId);
    const secondaryRefId = createMemo(() => props.secondaryDoc?.docRef.refId);

    const theory = () => {
        const doc = props.doc.liveDoc.doc;
        return doc.type === "model" ? doc.theory : undefined;
    };

    const handleClick = () => {
        // If clicking on primary or secondary doc, navigate to just that doc
        if (clickedRefId() === primaryRefId() || clickedRefId() === secondaryRefId()) {
            navigate(`/${createLinkPart(props.doc)}`);
        } else {
            // Otherwise, open it as a side panel
            navigate(`/${createLinkPart(props.primaryDoc)}/${createLinkPart(props.doc)}`);
        }
    };

    return (
        <div
            onClick={handleClick}
            class="related-document"
            classList={{
                active: props.doc.docRef.refId === props.primaryDoc.docRef.refId,
            }}
            style={{ "padding-left": `${props.indent * 16}px` }}
        >
            <DocumentTypeIcon
                documentType={props.doc.liveDoc.doc.type}
                isDeleted={props.doc.docRef.isDeleted}
                theory={theory()}
            />
            <div
                class="document-name"
                style={{ color: props.doc.docRef.isDeleted ? "lightgray" : undefined }}
            >
                {props.doc.liveDoc.doc.name || "Untitled"}
            </div>
            <div class="document-actions" onClick={(e) => e.stopPropagation()}>
                <DocumentMenu
                    liveDoc={props.doc.liveDoc}
                    docRef={props.doc.docRef}
                    onDocCreated={props.refetchDoc}
                    onDocDeleted={() => {
                        props.refetchDoc();
                        props.refetchPrimaryDoc();
                        props.refetchSecondaryDoc();
                    }}
                />
            </div>
        </div>
    );
}

function createLinkPart(doc: LiveDocWithRef): string {
    return `${doc.liveDoc.doc.type}/${doc.docRef.refId}`;
}
