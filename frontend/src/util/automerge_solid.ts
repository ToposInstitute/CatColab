import { DocHandle, DocHandleChangePayload } from "@automerge/automerge-repo";
import { Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

/** Create Solid-compatible getter/setter from an Automerge document handle.

Internally, a Solid Store is used along with the
[`reconcile`](https://www.solidjs.com/tutorial/stores_immutable) function to
diff the data and thus avoid re-rendering the whole DOM.
 */
export function useDoc<T extends object>(
    getHandle: () => DocHandle<T>,
    init: T,
): [() => T, (f: (d: T) => void) => void] {
    const [store, setStore] = createStore<T>(init);

    const onChange = (payload: DocHandleChangePayload<T>) => {
        setStore(reconcile(payload.doc));
    };

    let handle: DocHandle<T>;

    createEffect(() => {
        handle = getHandle();
        handle.doc().then((doc) => {
            doc && setStore(doc);
        });

        handle.on("change", onChange);
        onCleanup(() => {
            handle.off("change", onChange);
        });
    });

    const getDoc = () => store;

    async function changeDoc(f: (d: T) => void): Promise<void> {
        return handle.change(f);
    }

    return [getDoc, changeDoc];
}

/** Create boolean signal for whether an Automerge document handle is ready.
 */
export function useDocHandleReady(
    getHandle: () => DocHandle<unknown>,
): Accessor<boolean> {
    const [isReady, setIsReady] = createSignal<boolean>(false);

    createEffect(() => {
        setIsReady(false);

        getHandle().whenReady().then(() => {
            setIsReady(true);
        });
    });

    return isReady;
}
