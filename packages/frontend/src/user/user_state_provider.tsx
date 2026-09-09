import type { DocHandle, DocumentId } from "@automerge/automerge-repo";
import type { UserState } from "catcolab-api/src/user_state";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useFirebaseApp } from "solid-firebase";
import { type JSX, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { useApi } from "../api";
import { unwrap } from "../api/rpc";
import { normalizeImmutableStrings } from "../util/immutable_string";
import { INITIAL_USER_STATE, UserStateContext } from "./user_state_context";

export function UserStateProvider(props: { children: JSX.Element }) {
    const api = useApi();
    const firebaseApp = useFirebaseApp();
    const [userState, setUserState] = createStore<UserState>(INITIAL_USER_STATE);

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
        setUserState(INITIAL_USER_STATE);

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
            setUserState(reconcile(normalizeImmutableStrings(doc)));
        };
        currentChangeHandler = onChange;

        setUserState(reconcile(normalizeImmutableStrings(docHandle.doc())));
        docHandle.on("change", onChange);
    });

    onCleanup(() => {
        unsubscribeAuth();
        teardownDocHandle();
    });

    return (
        <UserStateContext.Provider value={userState}>{props.children}</UserStateContext.Provider>
    );
}
