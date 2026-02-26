import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import type { DocInfo } from "catcolab-api/src/user_state";
import { getAuth } from "firebase/auth";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import { useFirebaseApp } from "solid-firebase";
import { createMemo, createSignal, For, Show, useContext } from "solid-js";
import { stringify as uuidStringify } from "uuid";

import { Dialog, type DocumentType, DocumentTypeIcon, IconButton } from "catcolab-ui-components";
import { useApi } from "../api";
import { BrandedToolbar } from "../page";
import { TheoryLibraryContext } from "../theory";
import { createVirtualList } from "../util/virtual_list";
import "./documents.css";

import { LoginGate } from "./login";
import { currentUserPermission, formatOwners, useUserState } from "./user_state_context";

/** Fixed row height in pixels — must match --doc-row-height in CSS. */
const ROW_HEIGHT = 45;

export default function TrashBin() {
    const appTitle = import.meta.env.VITE_APP_TITLE;

    return (
        <>
            <Title>Trash - {appTitle}</Title>
            <div class="documents-page trash-bin-page">
                <BrandedToolbar />
                <div class="page-container">
                    <LoginGate>
                        <TrashBinSearch />
                    </LoginGate>
                </div>
            </div>
        </>
    );
}

function TrashBinSearch() {
    const userState = useUserState();
    const [searchQuery, setSearchQuery] = createSignal("");
    const [scrollHeight, setScrollHeight] = createSignal(400);

    const documents = createMemo(() => {
        const query = searchQuery().trim().toLowerCase();
        return (Object.entries(userState.documents) as [string, DocInfo][])
            .filter(([, doc]) => doc.deletedAt !== null)
            .map(([refId, doc]) => ({ refId, ...doc }))
            .filter((doc) => {
                if (query === "") {
                    return true;
                }
                return doc.name.toLowerCase().includes(query);
            })
            .sort((a, b) => {
                const aDeletedAt = a.deletedAt ?? 0;
                const bDeletedAt = b.deletedAt ?? 0;
                return bDeletedAt - aDeletedAt;
            });
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
            <h3>Trash</h3>
            <div class="ref-grid-outer">
                <div class="ref-grid-header">
                    <div />
                    <div />
                    <div>Name</div>
                    <div>Owners</div>
                    <div>Permission</div>
                    <div>Created</div>
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
                                {(doc) => <DeletedDocumentRow doc={doc} />}
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

function DeletedDocumentRow(props: { doc: DocInfo & { refId: string } }) {
    const firebaseApp = useFirebaseApp();
    const auth = getAuth(firebaseApp);
    const navigate = useNavigate();
    const api = useApi();
    const theories = useContext(TheoryLibraryContext);
    const userState = useUserState();

    const currentUserId = auth.currentUser?.uid;
    const ownerNames = formatOwners(props.doc.permissions, currentUserId);
    const userPermission = currentUserPermission(props.doc.permissions, currentUserId);
    const canRestore = props.doc.permissions.some(
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

    const [showError, setShowError] = createSignal(false);
    const [errorMessage, setErrorMessage] = createSignal("");

    const handleRestore = async () => {
        if (!canRestore) {
            return;
        }

        try {
            const result = await api.rpc.restore_ref.mutate(props.doc.refId);
            if (result.tag === "Ok") {
                navigate("/documents");
            } else {
                setErrorMessage(`Failed to restore document: ${result.message}`);
                setShowError(true);
            }
        } catch (error) {
            setErrorMessage(`Error restoring document: ${error}`);
            setShowError(true);
        }
    };

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

    const handleRestoreClick = (e: MouseEvent) => {
        e.stopPropagation();
        handleRestore();
    };

    return (
        <>
            <div
                class="ref-grid-row"
                onClick={handleClick}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                title="View document"
            >
                <div class="delete-cell">
                    {canRestore && (
                        <IconButton
                            variant="positive"
                            onClick={handleRestoreClick}
                            tooltip="Restore document"
                            type="button"
                        >
                            <RotateCcw size={16} />
                        </IconButton>
                    )}
                </div>
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
            </div>

            <Dialog open={showError()} onOpenChange={setShowError} title="Error">
                <form onSubmit={(evt) => evt.preventDefault()}>
                    <p>{errorMessage()}</p>
                    <div class="permissions-button-container">
                        <div class="permissions-spacer" />
                        <button type="button" class="ok" onClick={() => setShowError(false)}>
                            OK
                        </button>
                    </div>
                </form>
            </Dialog>
        </>
    );
}
