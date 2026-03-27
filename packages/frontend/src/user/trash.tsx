import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import type { DocInfo } from "catcolab-api/src/user_state";
import { getAuth } from "firebase/auth";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import { useFirebaseApp } from "solid-firebase";
import { createMemo, createSignal } from "solid-js";

import { Dialog, IconButton } from "catcolab-ui-components";
import { useApi } from "../api";
import { BrandedToolbar } from "../page";
import { DocumentList, filterDocuments } from "./document_list";
import { LoginGate } from "./login";
import { useUserState } from "./user_state_context";

import "./documents.css";

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

    const documents = createMemo(() =>
        filterDocuments(userState.documents, {
            query: searchQuery().trim().toLowerCase(),
            deleted: true,
        }),
    );

    const gridColumns = (
        <>
            <div />
            <div />
            <div>Name</div>
            <div>Owners</div>
            <div>Permission</div>
            <div>Created</div>
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
            <h3>Trash</h3>
            <DocumentList
                documents={documents}
                renderActions={(doc) => <RestoreButton doc={doc} />}
                gridColumns={gridColumns}
                actionsPosition="start"
            />
        </>
    );
}

function RestoreButton(props: { doc: DocInfo & { refId: string } }) {
    const firebaseApp = useFirebaseApp();
    const auth = getAuth(firebaseApp);
    const navigate = useNavigate();
    const api = useApi();

    const currentUserId = auth.currentUser?.uid;
    const canRestore = createMemo(() =>
        props.doc.permissions.some(
            (p) => p.user !== null && p.user === currentUserId && p.level === "Own",
        ),
    );

    const [showError, setShowError] = createSignal(false);
    const [errorMessage, setErrorMessage] = createSignal("");

    const handleRestore = async () => {
        if (!canRestore()) {
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

    const handleRestoreClick = (e: MouseEvent) => {
        e.stopPropagation();
        void handleRestore();
    };

    return (
        <>
            <div class="delete-cell">
                {canRestore() && (
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
