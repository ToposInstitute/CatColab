import { A } from "@solidjs/router";
import type { DocInfo } from "catcolab-api/src/user_state";
import { getAuth } from "firebase/auth";
import { useFirebaseApp } from "solid-firebase";
import { createMemo, createSignal, For, type JSX, Show, useContext } from "solid-js";
import { stringify as uuidStringify } from "uuid";

import { DocumentTypeIcon } from "catcolab-ui-components";
import { TheoryLibraryContext } from "../theory";
import { createVirtualList } from "../util/virtual_list";
import "./documents.css";

import { currentUserPermission, formatOwners, useUserState } from "./user_state_context";

/** Filter, search, and sort documents from user state. */
export function filterDocuments(
    documents: Record<string, DocInfo>,
    opts: {
        currentUserId: string | undefined;
        query: string;
        deleted: boolean;
    },
): (DocInfo & { refId: string })[] {
    return (Object.entries(documents) as [string, DocInfo][])
        .filter(([, doc]) => (opts.deleted ? doc.deletedAt !== null : doc.deletedAt === null))
        .filter(
            ([, doc]) =>
                opts.currentUserId !== undefined &&
                doc.permissions.some((p) => p.user === opts.currentUserId),
        )
        .map(([refId, doc]) => ({ refId, ...doc }))
        .filter((doc) => {
            if (opts.query === "") {
                return true;
            }
            return doc.name.toLowerCase().includes(opts.query);
        })
        .sort((a, b) => {
            if (opts.deleted) {
                return (b.deletedAt ?? 0) - (a.deletedAt ?? 0);
            }
            return b.createdAt - a.createdAt;
        });
}

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
        // Derive the parent ref ID from dependsOn relations.
        const parentRelType =
            props.doc.typeName === "diagram"
                ? "diagram-in"
                : props.doc.typeName === "analysis"
                  ? "analysis-of"
                  : undefined;
        if (!parentRelType) {
            return undefined;
        }
        const rel = props.doc.dependsOn.find((r) => r.relationType === parentRelType);
        if (!rel) {
            return undefined;
        }
        const parentId = uuidStringify(rel.refId as Uint8Array);
        const parentDoc = userState.documents[parentId];

        // If parent document doesn't exist, show as orphaned
        if (!parentDoc) {
            let prefix = "";
            if (props.doc.typeName === "diagram") {
                prefix = "Orphaned diagram";
            } else if (props.doc.typeName === "analysis") {
                prefix = "Orphaned analysis";
            } else {
                return undefined;
            }
            return { prefix, parentId: undefined, parentName: undefined, parentType: undefined };
        }

        const parentName = parentDoc.name || "Untitled";
        let prefix = "";
        if (props.doc.typeName === "diagram") {
            prefix = "Diagram in ";
        } else if (props.doc.typeName === "analysis") {
            prefix = "Analysis of ";
        } else {
            return undefined;
        }
        return { prefix, parentId, parentName, parentType: parentDoc.typeName };
    });

    return (
        <A href={`/${props.doc.typeName}/${props.doc.refId}`} class="ref-grid-row">
            {props.actionsPosition === "start" && props.renderActions(props.doc)}
            <div>
                <DocumentTypeIcon documentType={props.doc.typeName} letters={iconLetters()} />
            </div>
            <div class="name-cell">
                <Show when={props.doc.name} fallback={<span class="untitled-doc">Untitled</span>}>
                    <span>{props.doc.name}</span>
                </Show>
                <Show when={parentInfo()}>
                    {(info) => (
                        <span class="parent-description">
                            <Show
                                when={info().parentId && info().parentType}
                                fallback={<span class="parent-prefix">{info().prefix}</span>}
                            >
                                <span class="parent-prefix">{info().prefix}</span>
                                <A
                                    href={`/${info().parentType}/${info().parentId}`}
                                    class="parent-link"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {info().parentName}
                                </A>
                            </Show>
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
