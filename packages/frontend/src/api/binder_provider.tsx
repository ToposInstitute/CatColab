import { getAuth } from "firebase/auth";
import { useFirebaseApp } from "solid-firebase";
import { type JSX, onCleanup } from "solid-js";

import { BinderContext, useApi } from "./context";
import { createApiBinder } from "./document_store";

/** Provide a binder over the API document store, resolving document relations
 * through auth-backed metadata.
 *
 * Must wrap `UserStateProvider`. */
export function BinderProvider(props: { children: JSX.Element }) {
    const binder = createApiBinder(useApi(), getAuth(useFirebaseApp()));
    onCleanup(() => binder.dispose());

    return <BinderContext.Provider value={binder}>{props.children}</BinderContext.Provider>;
}
