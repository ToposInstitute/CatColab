import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import type { DocInfo } from "catcolab-api/src/user_state";
import { getAuth } from "firebase/auth";
import X from "lucide-solid/icons/x";
import { useFirebaseApp } from "solid-firebase";
import { createMemo, createSignal, For, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { IconButton } from "catcolab-ui-components";
import { BrandedToolbar, PageActionsContext } from "../page";
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
                    <div>Type</div>
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

    const currentUserId = auth.currentUser?.uid;
    const ownerNames = formatOwners(props.doc.permissions, currentUserId);
    const userPermission = currentUserPermission(props.doc.permissions, currentUserId);
    const canDelete = props.doc.permissions.some(
        (p) => p.user !== null && p.user.id === currentUserId && p.level === "Own",
    );

    const handleClick = () => {
        navigate(`/${props.doc.typeName}/${props.doc.refId}`);
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
        <div class="ref-grid-row" onClick={handleClick}>
            <div>{props.doc.typeName}</div>
            <div>{props.doc.name}</div>
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
