import { useNavigate } from "@solidjs/router";
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
    const navigate = useNavigate();
    const theories = useContext(TheoryLibraryContext);
    const userState = useUserState();

    const currentUserId = auth.currentUser?.uid;
    const ownerNames = formatOwners(props.doc.permissions, currentUserId);
    const userPermission = currentUserPermission(props.doc.permissions, currentUserId);

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

    const parentDescription = createMemo(() => {
        const parentBytes = props.doc.parent;
        if (!parentBytes) {
            return undefined;
        }
        const parentId = uuidStringify(parentBytes);
        const parentDoc = userState.documents[parentId];
        const parentName = parentDoc?.name || "Untitled";
        if (props.doc.typeName === "diagram") {
            return `Diagram in ${parentName}`;
        }
        if (props.doc.typeName === "analysis") {
            return `Analysis of ${parentName}`;
        }
        return undefined;
    });

    const handleClick = (e: MouseEvent) => {
        // Left click only
        if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
            navigate(`/${props.doc.typeName}/${props.doc.refId}`);
        }
    };

    const handleMouseDown = (e: MouseEvent) => {
        // Prevent default autoscroll on middle click
        if (e.button === 1) {
            e.preventDefault();
        }
    };

    const handleMouseUp = (e: MouseEvent) => {
        // Middle click (button 1) or Ctrl/Cmd+click should open in new tab
        if (e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey))) {
            window.open(`/${props.doc.typeName}/${props.doc.refId}`, "_blank");
            e.stopPropagation();
        }
    };

    return (
        <div
            class="ref-grid-row"
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
        >
            {props.actionsPosition === "start" && props.renderActions(props.doc)}
            <div>
                <DocumentTypeIcon
                    documentType={props.doc.typeName as DocumentType}
                    letters={iconLetters()}
                />
            </div>
            <div class="name-cell">
                <span>{props.doc.name}</span>
                <Show when={parentDescription()}>
                    <span class="parent-description">{parentDescription()}</span>
                </Show>
            </div>
            <div>{ownerNames}</div>
            <div>{userPermission}</div>
            <div>
                {new Date(props.doc.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                })}
            </div>
            {props.actionsPosition === "end" && props.renderActions(props.doc)}
        </div>
    );
}
