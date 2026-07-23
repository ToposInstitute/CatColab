import { A } from "@solidjs/router";
import type { DocInfo } from "catcolab-api/src/user_state";
import { getAuth } from "firebase/auth";
import { useFirebaseApp } from "solid-firebase";
import { createMemo, createSignal, For, type JSX, Show, useContext } from "solid-js";
import { stringify as uuidStringify } from "uuid";

import { RelativeTime, createVirtualList, DocumentTypeIcon } from "catcolab-ui-components";
import { TheoryLibraryContext } from "../theory";
import { assertExhaustive } from "../util/assert_exhaustive";
import { isDocumentVisible, type UserSettings } from "./user_settings_context";
import { currentUserPermission, formatOwners, useUserState } from "./user_state_context";

import "./documents.css";

/** Filter, search, and sort documents from user state. */
export function filterDocuments(
    documents: Partial<Record<string, DocInfo>>,
    opts: {
        query: string;
        deleted: boolean;
        settings: UserSettings;
    },
): (DocInfo & { refId: string })[] {
    return (Object.entries(documents) as [string, DocInfo][])
        .filter(([, doc]) => isDocumentVisible(doc, opts.settings))
        .filter(([, doc]) => (opts.deleted ? doc.deletedAt !== null : doc.deletedAt === null))
        .map(([refId, doc]) => Object.assign({ refId }, doc))
        .filter((doc) => {
            if (opts.query === "") {
                return true;
            }
            return doc.name.toLowerCase().includes(opts.query);
        })
        .toSorted((a, b) => {
            if (opts.deleted) {
                return (b.deletedAt ?? 0) - (a.deletedAt ?? 0);
            }
            return b.currentSnapshotUpdatedAt - a.currentSnapshotUpdatedAt;
        });
}

/** Fixed row height in pixels — must match --doc-row-height in CSS. */
const ROW_HEIGHT = 45;

type ParentDocumentDetails = {
    relationType: "diagram-in" | "analysis-of" | "llmconversation-of";
    prefix: string;
    orphanedPrefix: string;
};

function parentDocumentDetails(typeName: DocInfo["typeName"]): ParentDocumentDetails | undefined {
    switch (typeName) {
        case "model":
            return undefined;
        case "diagram":
            return {
                relationType: "diagram-in",
                prefix: "Diagram in ",
                orphanedPrefix: "Orphaned diagram",
            };
        case "analysis":
            return {
                relationType: "analysis-of",
                prefix: "Analysis of ",
                orphanedPrefix: "Orphaned analysis",
            };
        case "llmconversation":
            return {
                relationType: "llmconversation-of",
                prefix: "LLM Conversation about ",
                orphanedPrefix: "Orphaned LLM conversation",
            };
        default:
            return assertExhaustive(typeName);
    }
}

interface DocumentListProps {
    documents: () => (DocInfo & { refId: string })[];
    renderActions: (doc: DocInfo & { refId: string }) => JSX.Element;
    gridColumns: JSX.Element;
    actionsPosition?: "start" | "end";
}

export function DocumentList(props: DocumentListProps) {
    const [scrollHeight, setScrollHeight] = createSignal(400);

    const [virtualList, onScroll] = createVirtualList({
        items: () => props.documents(),
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
        const details = parentDocumentDetails(props.doc.typeName);
        if (!details) {
            return undefined;
        }
        const relation = props.doc.dependsOn.find(
            (relation) => relation.relationType === details.relationType,
        );
        if (!relation) {
            return undefined;
        }
        const parentId = uuidStringify(relation.refId);
        const parentDoc = userState.documents[parentId];
        if (!parentDoc) {
            return {
                prefix: details.orphanedPrefix,
                parentId: undefined,
                parentName: undefined,
                parentType: undefined,
            };
        }
        return {
            prefix: details.prefix,
            parentId,
            parentName: parentDoc.name || "Untitled",
            parentType: parentDoc.typeName,
        };
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
                <RelativeTime timestamp={props.doc.createdAt} />
            </div>
            <div>
                <RelativeTime timestamp={props.doc.currentSnapshotUpdatedAt} />
            </div>
            {props.actionsPosition === "end" && props.renderActions(props.doc)}
        </A>
    );
}
