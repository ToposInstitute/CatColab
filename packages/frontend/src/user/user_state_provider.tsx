import type { DocHandle, DocumentId } from "@automerge/automerge-repo";
import type { UserState } from "catcolab-api/src/user_state";
import { type JSX, onMount } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { useApi } from "../api";
import { unwrap } from "../api/rpc";
import { normalizeImmutableStrings } from "../util/immutable_string";
import { INITIAL_USER_STATE, UserStateContext } from "./user_state_context";

export function UserStateProvider(props: { children: JSX.Element }) {
    const api = useApi();
    const [userState, setUserState] = createStore<UserState>(INITIAL_USER_STATE);

    onMount(async () => {
        const userStateDocId = unwrap(await api.rpc.get_user_state_doc_id.query());
        const docHandle = (await api.repo.find(
            userStateDocId as DocumentId,
        )) as DocHandle<UserState>;
        setUserState(reconcile(normalizeImmutableStrings(docHandle.doc())));
        docHandle.on("change", ({ doc }) => {
            setUserState(reconcile(normalizeImmutableStrings(doc)));
        });
    });
    return (
        <UserStateContext.Provider value={userState}>{props.children}</UserStateContext.Provider>
    );
}
