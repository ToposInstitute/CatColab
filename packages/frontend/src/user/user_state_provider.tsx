import { ImmutableString } from "@automerge/automerge";
import type { DocHandle, DocumentId } from "@automerge/automerge-repo";
import type { UserState } from "catcolab-api/src/user_state";
import { type JSX, onMount } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { useApi } from "../api";
import { unwrap } from "../api/rpc";
import { INITIAL_USER_STATE, UserStateContext } from "./user_state_context";

/** Recursively convert any `ImmutableString` values to native strings. */
function normalizeImmutableStrings<T>(value: T): T {
    if (value instanceof ImmutableString) {
        return value.toString() as unknown as T;
    }
    if (Array.isArray(value)) {
        return value.map(normalizeImmutableStrings) as unknown as T;
    }
    if (value !== null && typeof value === "object") {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = normalizeImmutableStrings(v);
        }
        return result as T;
    }
    return value;
}

export function UserStateProvider(props: { children: JSX.Element }) {
    const api = useApi();
    const [userState, setUserState] = createStore<UserState>(INITIAL_USER_STATE);

    onMount(async () => {
        const userStateUrl = unwrap(await api.rpc.get_user_state_url.query());
        const docHandle = (await api.repo.find(userStateUrl as DocumentId)) as DocHandle<UserState>;
        setUserState(reconcile(normalizeImmutableStrings(docHandle.doc())));
        docHandle.on("change", ({ doc }) => {
            setUserState(reconcile(normalizeImmutableStrings(doc)));
        });
    });
    return (
        <UserStateContext.Provider value={userState}>{props.children}</UserStateContext.Provider>
    );
}
