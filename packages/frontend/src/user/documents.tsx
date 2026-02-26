import { Title } from "@solidjs/meta";
import type { DocInfo } from "catcolab-api/src/user_state";
import { getAuth } from "firebase/auth";
import X from "lucide-solid/icons/x";
import { useFirebaseApp } from "solid-firebase";
import { createMemo, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { IconButton } from "catcolab-ui-components";
import { BrandedToolbar, PageActionsContext } from "../page";
import "./documents.css";

import { DocumentList } from "./document_list";
import { LoginGate } from "./login";
import { useUserState } from "./user_state_context";

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
    const actions = useContext(PageActionsContext);
    invariant(actions, "Page actions should be provided");

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

    const renderActions = (doc: DocInfo & { refId: string }) => {
        return <DeleteButton doc={doc} />;
    };

    const gridColumns = (
        <>
            <div />
            <div>Name</div>
            <div>Owners</div>
            <div>Permission</div>
            <div>Created</div>
            <div />
        </>
    );

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
            <DocumentList
                documents={documents}
                renderActions={renderActions}
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
    const canDelete = props.doc.permissions.some(
        (p) => p.user !== null && p.user.id === currentUserId && p.level === "Own",
    );

    const handleDeleteClick = async (e: MouseEvent) => {
        e.stopPropagation();
        await actions.showDeleteDialog({
            refId: props.doc.refId,
            name: props.doc.name,
            typeName: props.doc.typeName,
        });
    };

    return (
        <div class="delete-cell">
            {canDelete && (
                <IconButton variant="danger" onClick={handleDeleteClick} tooltip="Delete document">
                    <X size={16} />
                </IconButton>
            )}
        </div>
    );
}
