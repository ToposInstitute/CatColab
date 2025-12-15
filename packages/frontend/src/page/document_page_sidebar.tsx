import { useNavigate } from "@solidjs/router";
import { createMemo, createResource, For, Show } from "solid-js";
import invariant from "tiny-invariant";

import type { Document, Link } from "catlog-wasm";
import { type Api, type LiveDocWithRef, useApi } from "../api";
import { DocumentTypeIcon } from "../components/document_type_icon";
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
    const parentDoc = await getDocParent(doc.liveDoc.doc, api);
    if (!parentDoc) {
        return doc;
    }
    return getLiveDocRoot(parentDoc, api);
}

async function getDocParent(doc: Document, api: Api): Promise<LiveDocWithRef | undefined> {
    let parentLink: Link | undefined;
    switch (doc.type) {
        case "diagram":
            parentLink = doc.diagramIn;
            break;
        case "analysis":
            parentLink = doc.analysisOf;
            break;
        default:
            break;
    }
    if (!parentLink) {
        return;
    }
    const parentDoc = await api.getLiveDoc(parentLink._id);
    return parentDoc;
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

            const childDocs = await Promise.all(
                results.content.map((childStub) => api.getLiveDoc(childStub.refId)),
            );

            function isDocOwnerless(doc: LiveDocWithRef) {
                return doc.docRef.permissions.anyone === "Own";
            }

            const isParentOwnerless = isDocOwnerless(props.doc);

            // Don't show ownerless children or deleted documents
            return childDocs.filter(
                (childDoc) =>
                    !childDoc.docRef.isDeleted && (isParentOwnerless || !isDocOwnerless(childDoc)),
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
    const api = useApi();
    const clickedRefId = createMemo(() => props.doc.docRef.refId);
    const primaryRefId = createMemo(() => props.primaryDoc.docRef.refId);
    const secondaryRefId = createMemo(() => props.secondaryDoc?.docRef.refId);

    const handleClick = async () => {
        // If clicking on primary or secondary doc, navigate to just that doc
        if (clickedRefId() === primaryRefId() || clickedRefId() === secondaryRefId()) {
            navigate(`/${createLinkPart(props.doc)}`);
        } else {
            // Otherwise, open it as a side panel or put on the left if it is a parent doc
            const clickedDoc = props.doc;
            const parentOfPrimary = await getDocParent(props.primaryDoc.liveDoc.doc, api);
            if (parentOfPrimary && clickedDoc.docRef.refId === parentOfPrimary.docRef.refId) {
                navigate(`/${createLinkPart(clickedDoc)}/${createLinkPart(props.primaryDoc)}`);
            } else {
                navigate(`/${createLinkPart(props.primaryDoc)}/${createLinkPart(clickedDoc)}`);
            }
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
            />
            <div
                class="document-name"
                style={{ color: props.doc.docRef.isDeleted ? "var(--color-gray-450)" : undefined }}
            >
                {props.doc.liveDoc.doc.name || "Untitled"}
            </div>
            <div class="document-actions" onClick={(e) => e.stopPropagation()}>
                <DocumentMenu
                    liveDoc={props.doc.liveDoc}
                    docRef={props.doc.docRef}
                    onDocCreated={props.refetchDoc}
                    onDocDeleted={async () => {
                        const deletedRefId = props.doc.docRef.refId;
                        const isPrimaryDeleted = deletedRefId === primaryRefId();
                        const isSecondaryDeleted = deletedRefId === secondaryRefId();

                        props.refetchDoc();
                        props.refetchPrimaryDoc();
                        props.refetchSecondaryDoc();

                        // Navigate away if the deleted document is currently being viewed
                        if (isPrimaryDeleted || isSecondaryDeleted) {
                            const parentDoc = await getDocParent(props.doc.liveDoc.doc, api);

                            if (!parentDoc) {
                                // This is a root document: navigate to documents list
                                navigate("/documents");
                            } else {
                                navigate(`/${createLinkPart(parentDoc)}`);
                            }
                        }
                    }}
                />
            </div>
        </div>
    );
}

function createLinkPart(doc: LiveDocWithRef): string {
    return `${doc.liveDoc.doc.type}/${doc.docRef.refId}`;
}
