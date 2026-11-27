import type { UserState } from "catcolab-api/src/user_state";
import { type JSX, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { useBinder } from "../api/context";
import { UserStateContext } from "./user_state_context";

export function UserStateProvider(props: { children: JSX.Element }) {
    const meta = useBinder().meta;
    const snapshot = () => structuredClone(meta.data()) as UserState;
    const [userState, setUserState] = createStore(snapshot());
    onCleanup(meta.onChange(() => setUserState(reconcile(snapshot()))));
    return (
        <UserStateContext.Provider value={userState}>{props.children}</UserStateContext.Provider>
    );
}
