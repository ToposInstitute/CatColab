import type {
    DocHandle,
    DocHandleChangePayload,
    DocumentId,
    Repo,
} from "@automerge/automerge-repo";
import { type Accessor, createContext, createEffect, createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import * as uuid from "uuid";

import type { RpcClient } from "./rpc";

/** Context for the Automerge repo. */
export const RepoContext = createContext<Repo>();

/** Automerge document retrieved from the backend. */
export type RetrievedDoc<T> = {
    doc: T;
    docHandle: DocHandle<T>;
};

/** Retrieve an Automerge document from the backend.

Returns a document that is reactive along with the Automerge document handle.
 */
export async function retrieveDoc<T extends object>(
    rpc: RpcClient,
    refId: string,
    repo: Repo,
): Promise<RetrievedDoc<T>> {
    let docId: DocumentId;

    if (uuid.validate(refId)) {
        const result = await rpc.doc_id.query(refId);
        if (result.tag === "Ok") {
            docId = result.content as DocumentId;
        } else {
            throw new Error(`Failed to retrieve document: ${result.message}`);
        }
    } else {
        throw new Error(`Invalid document ref ${refId}`);
    }

    const docHandle = repo.find(docId) as DocHandle<T>;
    const doc = await makeDocReactive(docHandle);

    return { doc, docHandle };
}

/** Create a Solid Store that tracks an Automerge document.
 */
export async function makeDocReactive<T extends object>(handle: DocHandle<T>): Promise<T> {
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
