import type { DocHandle, DocHandleChangePayload } from "@automerge/automerge-repo";
import { type Accessor, createEffect, createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

/** Create Solid-compatible getter/setter from an Automerge document handle.

Internally, a Solid Store is used along with the
[`reconcile`](https://www.solidjs.com/tutorial/stores_immutable) function to
diff the data and thus avoid re-rendering the whole DOM.

Note that `init` is only used to initialize the *store* and not to initialize
the automerge document.
 */
export async function makeReactive<T extends object>(handle: DocHandle<T>): Promise<T> {
    const init = await handle.doc();

    const [store, setStore] = createStore<T>(init as T);

    const onChange = (payload: DocHandleChangePayload<T>) => {
        setStore(reconcile(payload.doc));
    };

    handle.on("change", onChange);

    return store;
}

/** Create boolean signal for whether an Automerge document handle is ready.
 */
export function useDocHandleReady(getHandle: () => DocHandle<unknown>): Accessor<boolean> {
    const [isReady, setIsReady] = createSignal<boolean>(false);

    createEffect(() => {
        setIsReady(false);

        getHandle()
            .whenReady()
            .then(() => {
                setIsReady(true);
            });
    });

    return isReady;
}
