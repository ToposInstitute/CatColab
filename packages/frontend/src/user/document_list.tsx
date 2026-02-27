import { A } from "@solidjs/router";
import type { DocInfo } from "catcolab-api/src/user_state";
import { getAuth } from "firebase/auth";
import { useFirebaseApp } from "solid-firebase";
import { createMemo, createSignal, For, type JSX, Show, useContext } from "solid-js";
import { stringify as uuidStringify } from "uuid";

import { type DocumentType, DocumentTypeIcon } from "catcolab-ui-components";
import { TheoryLibraryContext } from "../theory";
import { createVirtualList } from "../util/virtual_list";
import "./documents.css";

import { currentUserPermission, formatOwners, useUserState } from "./user_state_context";

/** Fixed row height in pixels — must match --doc-row-height in CSS. */
const ROW_HEIGHT = 45;

interface DocumentListProps {
    documents: () => (DocInfo & { refId: string })[];
    renderActions: (doc: DocInfo & { refId: string }) => JSX.Element;
    gridColumns: JSX.Element;
    actionsPosition?: "start" | "end";
}

export function DocumentList(props: DocumentListProps) {
    const [scrollHeight, setScrollHeight] = createSignal(400);

    const [virtualList, onScroll] = createVirtualList({
        items: props.documents,
        rootHeight: scrollHeight,
        rowHeight: () => ROW_HEIGHT,
        overscanCount: 5,
    });

    /** Measure scroll container height on mount and resize. */
    const measureRef = (el: HTMLDivElement) => {
        const measure = () => setScrollHeight(el.clientHeight);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
    };

    return (
        <div class="ref-grid-outer">
            <div class="ref-grid-header">{props.gridColumns}</div>
            <div class="ref-grid-scroll" ref={measureRef} onScroll={onScroll}>
                <div
                    style={{
                        position: "relative",
                        width: "100%",
                        height: `${virtualList().containerHeight}px`,
                    }}
                >
                    <div
                        style={{
                            position: "absolute",
                            top: `${virtualList().viewerTop}px`,
                            width: "100%",
                        }}
                    >
                        <For each={virtualList().visibleItems}>
                            {(doc) => (
                                <DocumentRow
                                    doc={doc}
                                    renderActions={props.renderActions}
                                    actionsPosition={props.actionsPosition ?? "end"}
                                />
                            )}
                        </For>
                    </div>
                </div>
                {props.documents().length === 0 && (
                    <div class="ref-grid-row">
                        <div style={{ "grid-column": "1 / -1", "text-align": "center" }}>
                            No documents found.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

interface DocumentRowProps {
    doc: DocInfo & { refId: string };
    renderActions: (doc: DocInfo & { refId: string }) => JSX.Element;
    actionsPosition: "start" | "end";
}

function DocumentRow(props: DocumentRowProps) {
    const firebaseApp = useFirebaseApp();
    const auth = getAuth(firebaseApp);
    const theories = useContext(TheoryLibraryContext);
    const userState = useUserState();

    const currentUserId = auth.currentUser?.uid;
    const ownerNames = createMemo(() =>
        formatOwners(props.doc.permissions, currentUserId, userState.knownUsers),
    );
    const userPermission = createMemo(() =>
        currentUserPermission(props.doc.permissions, currentUserId),
    );

    const iconLetters = createMemo(() => {
        const theoryId = props.doc.theory;
        if (theoryId && theories) {
            try {
                return theories.getMetadata(theoryId).iconLetters;
            } catch (_e) {
                return undefined;
            }
        }
        return undefined;
    });

    const parentInfo = createMemo(() => {
        const parentBytes = props.doc.parent;
        if (!parentBytes) {
            return undefined;
        }
        const parentId = uuidStringify(parentBytes);
        const parentDoc = userState.documents[parentId];
        const parentName = parentDoc?.name || "Untitled";
        let prefix = "";
        if (props.doc.typeName === "diagram") {
            prefix = "Diagram in ";
        } else if (props.doc.typeName === "analysis") {
            prefix = "Analysis of ";
        } else {
            return undefined;
        }
        return { prefix, parentId, parentName, parentType: parentDoc?.typeName };
    });

    return (
        <A href={`/${props.doc.typeName}/${props.doc.refId}`} class="ref-grid-row">
            {props.actionsPosition === "start" && props.renderActions(props.doc)}
            <div>
                <DocumentTypeIcon
                    documentType={props.doc.typeName as DocumentType}
                    letters={iconLetters()}
                />
            </div>
            <div class="name-cell">
                <Show when={props.doc.name} fallback={<span class="untitled-doc">Untitled</span>}>
                    <span>{props.doc.name}</span>
                </Show>
                <Show when={parentInfo()}>
                    {(info) => (
                        <span class="parent-description">
                            <span class="parent-prefix">{info().prefix}</span>
                            <A
                                href={`/${info().parentType}/${info().parentId}`}
                                class="parent-link"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {info().parentName}
                            </A>
                        </span>
                    )}
                </Show>
            </div>
            <div>{ownerNames()}</div>
            <div>{userPermission()}</div>
            <div>
                {new Date(props.doc.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                })}
            </div>
            {props.actionsPosition === "end" && props.renderActions(props.doc)}
        </A>
    );
}
