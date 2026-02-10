import type { Doc, DocHandle, DocumentId } from "@automerge/automerge-repo";
import { createSignal, type JSX, onMount } from "solid-js";

import { useApi } from "../api";
import { unwrap } from "../api/rpc";
import { INITIAL_USER_STATE, type UserState, UserStateContext } from "./user_state_context";

export function UserStateProvider(props: { children: JSX.Element }) {
    const [userState, setUserState] = createSignal<Doc<UserState>>(INITIAL_USER_STATE);
    const api = useApi();

    onMount(async () => {
        const userStateUrl = unwrap(await api.rpc.get_user_state_url.query());
        const docHandle = (await api.repo.find(userStateUrl as DocumentId)) as DocHandle<UserState>;
        setUserState(docHandle.doc());
        docHandle.on("change", ({ doc }) => {
            console.log("User state changed", doc);
            setUserState(doc);
        });
    });
    return (
        <UserStateContext.Provider value={userState()}>{props.children}</UserStateContext.Provider>
    );
}
