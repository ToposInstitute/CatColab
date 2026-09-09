import { type JSX } from "solid-js";

import { useUserState } from "../user/user_state_context";
import { BinderContext, useApi } from "./context";
import { createApiBinder } from "./document_store";

/** Provide a binder over the API document store, resolving document relations
 * through the user state from application context.
 *
 * Must be nested inside `UserStateProvider`. */
export function BinderProvider(props: { children: JSX.Element }) {
    const binder = createApiBinder(useApi(), useUserState());

    return <BinderContext.Provider value={binder}>{props.children}</BinderContext.Provider>;
}
