import { Title } from "@solidjs/meta";
import type { DocInfo } from "catcolab-api/src/user_state";
import { getAuth } from "firebase/auth";
import X from "lucide-solid/icons/x";
import { useFirebaseApp } from "solid-firebase";
import { createMemo, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { IconButton } from "catcolab-ui-components";
import { documentTypeLabel } from "../api";
import { BrandedToolbar, PageActionsContext } from "../page";
import { DocumentList, filterDocuments } from "./document_list";
import { LoginGate } from "./login";
import { useUserSettings } from "./user_settings";
import { useUserState } from "./user_state_context";

import "./documents.css";

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
    const { settings } = useUserSettings();
    const [searchQuery, setSearchQuery] = createSignal("");
    const actions = useContext(PageActionsContext);
    invariant(actions, "Page actions should be provided");

    const documents = createMemo(() =>
        filterDocuments(userState.documents, {
            query: searchQuery().trim().toLowerCase(),
            deleted: false,
            settings: settings(),
        }),
    );

    const gridColumns = (
        <>
            <div />
            <div>Name</div>
            <div>Owners</div>
            <div>Permission</div>
            <div>Created</div>
            <div>Last edited</div>
            <div />
        </>
    );

    return (
        <>
            <h1>My documents</h1>
            <input
                type="text"
                class="search-input"
                placeholder="Search..."
                value={searchQuery()}
                onInput={(e) => setSearchQuery(e.currentTarget.value)}
            />
            <DocumentList
                documents={documents}
                renderActions={(doc) => <DeleteButton doc={doc} />}
                gridColumns={gridColumns}
            />
        </>
    );
}

function DeleteButton(props: { doc: DocInfo & { refId: string } }) {
    const firebaseApp = useFirebaseApp();
    const auth = getAuth(firebaseApp);
    const actions = useContext(PageActionsContext);
    invariant(actions, "Page actions should be provided");

    const currentUserId = auth.currentUser?.uid;
    const canDelete = createMemo(() =>
        props.doc.permissions.some(
            (p) => p.user !== null && p.user === currentUserId && p.level === "Own",
        ),
    );

    const handleDeleteClick = async (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        await actions.showDeleteDialog({
            refId: props.doc.refId,
            name: props.doc.name,
            typeName: documentTypeLabel(props.doc.typeName),
        });
    };

    return (
        <div class="delete-cell" onClick={(e) => e.stopPropagation()}>
            {canDelete() && (
                <IconButton variant="danger" onClick={handleDeleteClick} tooltip="Delete document">
                    <X size={16} />
                </IconButton>
            )}
        </div>
    );
}
