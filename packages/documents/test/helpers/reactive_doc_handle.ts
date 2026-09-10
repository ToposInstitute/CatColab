import type { DocHandle } from "@automerge/automerge-repo";
import { createStore, reconcile } from "solid-js/store";

/** Create a Solid store that tracks an Automerge document handle. */
export function makeDocHandleReactive<T extends object>(handle: DocHandle<T>): T {
    const [store, setStore] = createStore<T>(handle.doc());
    handle.on("change", (payload) => {
        setStore(reconcile(payload.doc));
    });
    return store;
}
