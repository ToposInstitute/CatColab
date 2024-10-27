import type {
    DocHandle,
    DocHandleChangePayload,
    DocumentId,
    Repo,
} from "@automerge/automerge-repo";
import { type Accessor, createContext, createEffect, createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import invariant from "tiny-invariant";
import * as uuid from "uuid";

import type { Permissions } from "catcolab-api";
import type { RpcClient } from "./rpc";

/** Context for the Automerge repo. */
export const RepoContext = createContext<Repo>();

/** Reactive document retrieved from the backend. */
export type ReactiveDoc<T> = {
    doc: T;
    docHandle?: DocHandle<T>;
    permissions: Permissions;
};

/** Retrieve a reactive document from the backend.

When the user has write permissions, the document will connected to a live
Automerge document handle.
 */
export async function getReactiveDoc<T extends object>(
    rpc: RpcClient,
    refId: string,
    repo: Repo,
): Promise<ReactiveDoc<T>> {
    invariant(uuid.validate(refId), () => `Invalid document ref ${refId}`);

    const result = await rpc.get_doc.query(refId);
    if (result.tag !== "Ok") {
        throw new Error(`Failed to retrieve document: ${result.message}`);
    }

    const refDoc = result.content;
    const permissions = refDoc.permissions;
    if (refDoc.tag === "Live") {
        const docId = refDoc.docId as DocumentId;
        const docHandle = repo.find(docId) as DocHandle<T>;

        const doc = await makeDocHandleReactive(docHandle);
        return { doc, docHandle, permissions };
    } else {
        const init = refDoc.content as T;

        // TODO: Handle reactivity in read-only case using
        // [`produce`](https://docs.solidjs.com/reference/store-utilities/produce).
        const [doc, _] = createStore<T>(init);
        return { doc, permissions };
    }
}

/** Create a Solid Store that tracks an Automerge document.
 */
export async function makeDocHandleReactive<T extends object>(handle: DocHandle<T>): Promise<T> {
    const init = await handle.doc();

    const [store, setStore] = createStore<T>(init as T);

    const onChange = (payload: DocHandleChangePayload<T>) => {
        // Use [`reconcile`](https://www.solidjs.com/tutorial/stores_immutable)
        // function to diff the data and thus avoid re-rendering the whole DOM.
        setStore(reconcile(payload.doc));
    };

    handle.on("change", onChange);

    return store;
}

/** Create a boolean signal for whether an Automerge document handle is ready.
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
