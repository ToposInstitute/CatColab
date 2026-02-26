import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import type { DocInfo } from "catcolab-api/src/user_state";
import { getAuth } from "firebase/auth";
import X from "lucide-solid/icons/x";
import { useFirebaseApp } from "solid-firebase";
import { createMemo, createSignal, For, Show, useContext } from "solid-js";
import invariant from "tiny-invariant";
import { stringify as uuidStringify } from "uuid";

import { type DocumentType, DocumentTypeIcon, IconButton } from "catcolab-ui-components";
import { BrandedToolbar, PageActionsContext } from "../page";
import { TheoryLibraryContext } from "../theory";
import { createVirtualList } from "../util/virtual_list";
import "./documents.css";

import { LoginGate } from "./login";
import { currentUserPermission, formatOwners, useUserState } from "./user_state_context";

/** Fixed row height in pixels — must match --doc-row-height in CSS. */
const ROW_HEIGHT = 45;

export default function UserDocuments() {
    const appTitle = import.meta.env.VITE_APP_TITLE;

    return (
        <>
            <Title>My Documents - {appTitle}</Title>
            <div class="documents-page">
                <BrandedToolbar />
                <div class="page-container">
                    <LoginGate>
                        <DocumentsSearch />
                    </LoginGate>
                </div>
            </div>
        </>
    );
}

function DocumentsSearch() {
    const userState = useUserState();
    const [searchQuery, setSearchQuery] = createSignal("");
    const [scrollHeight, setScrollHeight] = createSignal(400);

    const documents = createMemo(() => {
        const query = searchQuery().trim().toLowerCase();
        return (Object.entries(userState.documents) as [string, DocInfo][])
            .filter(([, doc]) => doc.deletedAt === null)
            .map(([refId, doc]) => ({ refId, ...doc }))
            .filter((doc) => {
                if (query === "") {
                    return true;
                }
                return doc.name.toLowerCase().includes(query);
            })
            .sort((a, b) => b.createdAt - a.createdAt);
    });

    const [virtualList, onScroll] = createVirtualList({
        items: documents,
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
        <>
            <input
                type="text"
                class="search-input"
                placeholder="Search..."
                value={searchQuery()}
                onInput={(e) => setSearchQuery(e.currentTarget.value)}
            />
            <h3>My Documents</h3>
            <div class="ref-grid-outer">
                <div class="ref-grid-header">
                    <div />
                    <div>Name</div>
                    <div>Owners</div>
                    <div>Permission</div>
                    <div>Created</div>
                    <div />
                </div>
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
                                {(doc) => <DocumentRow doc={doc} />}
                            </For>
                        </div>
                    </div>
                    {documents().length === 0 && (
                        <div class="ref-grid-row">
                            <div style={{ "grid-column": "1 / -1", "text-align": "center" }}>
                                No documents found.
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

function DocumentRow(props: { doc: DocInfo & { refId: string } }) {
    const firebaseApp = useFirebaseApp();
    const auth = getAuth(firebaseApp);
    const navigate = useNavigate();
    const actions = useContext(PageActionsContext);
    invariant(actions, "Page actions should be provided");
    const theories = useContext(TheoryLibraryContext);
    const userState = useUserState();

    const currentUserId = auth.currentUser?.uid;
    const ownerNames = formatOwners(props.doc.permissions, currentUserId);
    const userPermission = currentUserPermission(props.doc.permissions, currentUserId);
    const canDelete = props.doc.permissions.some(
        (p) => p.user !== null && p.user.id === currentUserId && p.level === "Own",
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

    const parentDescription = createMemo(() => {
        const parentBytes = props.doc.parent;
        if (!parentBytes) return undefined;
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

    const handleDeleteClick = async (e: MouseEvent) => {
        e.stopPropagation();
        await actions.showDeleteDialog({
            refId: props.doc.refId,
            name: props.doc.name,
            typeName: props.doc.typeName,
        });
    };

    return (
        <div
            class="ref-grid-row"
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
        >
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
            <div class="delete-cell">
                {canDelete && (
                    <IconButton
                        variant="danger"
                        onClick={handleDeleteClick}
                        tooltip="Delete document"
                    >
                        <X size={16} />
                    </IconButton>
                )}
            </div>
        </div>
    );
}
