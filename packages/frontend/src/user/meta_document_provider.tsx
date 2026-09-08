import type { DocHandle, DocumentId } from "@automerge/automerge-repo";
import type { UserState } from "catcolab-api/src/user_state";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useFirebaseApp } from "solid-firebase";
import { type JSX, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { BinderContext, createApiBinder, useApi } from "../api";
import { unwrap } from "../api/rpc";
import { normalizeImmutableStrings } from "../util/immutable_string";
import { INITIAL_META_DOCUMENT, MetaDocumentContext } from "./meta_document_context";

export function MetaDocumentProvider(props: { children: JSX.Element }) {
    const api = useApi();
    const firebaseApp = useFirebaseApp();
    const [metaDocument, setMetaDocument] = createStore<UserState>(INITIAL_META_DOCUMENT);

    // The binder resolves relations between the user's documents through the
    // meta document, so it is created here, where the data lives, and provided
    // alongside it. The store updates in place, so the binder keeps seeing
    // current data across auth changes.
    const binder = createApiBinder(api, metaDocument);

    let currentDocHandle: DocHandle<UserState> | null = null;
    let currentChangeHandler: ((arg: { doc: UserState }) => void) | null = null;
    let currentUserId: string | null = null;

    const teardownDocHandle = () => {
        if (currentDocHandle && currentChangeHandler) {
            currentDocHandle.off("change", currentChangeHandler);
        }
        currentDocHandle = null;
        currentChangeHandler = null;
    };

    // This will initialize on first load and re-initialize on logout/login
    const unsubscribeAuth = onAuthStateChanged(getAuth(firebaseApp), async (user) => {
        const userId = user?.uid ?? null;
        currentUserId = userId;

        teardownDocHandle();
        setMetaDocument(INITIAL_META_DOCUMENT);

        const userStateDocId = unwrap(await api.rpc.get_user_state_doc_id.query());
        if (currentUserId !== userId) {
            return;
        }

        const docHandle: DocHandle<UserState> = await api.repo.find(userStateDocId as DocumentId);
        if (currentUserId !== userId) {
            return;
        }

        currentDocHandle = docHandle;
        const onChange = ({ doc }: { doc: UserState }) => {
            setMetaDocument(reconcile(normalizeImmutableStrings(doc)));
        };
        currentChangeHandler = onChange;

        setMetaDocument(reconcile(normalizeImmutableStrings(docHandle.doc())));
        docHandle.on("change", onChange);
    });

    onCleanup(() => {
        unsubscribeAuth();
        teardownDocHandle();
    });

    return (
        <BinderContext.Provider value={binder}>
            <MetaDocumentContext.Provider value={metaDocument}>
                {props.children}
            </MetaDocumentContext.Provider>
        </BinderContext.Provider>
    );
}
