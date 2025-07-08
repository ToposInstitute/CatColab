import {
    type ChangeFn,
    type DocHandle,
    type DocHandleChangePayload,
    type DocumentId,
    Repo,
} from "@automerge/automerge-repo";
import { type Accessor, createEffect, createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import invariant from "tiny-invariant";
import * as uuid from "uuid";

import type { Permissions } from "catcolab-api";
import { PermissionsError } from "../util/errors";
import type { Api, Document } from "./types";

/** An Automerge repo with no networking, used for read-only documents. */
const localRepo = new Repo();

/** Live document retrieved from the backend.

A live document can be used in reactive contexts and is connected to an
Automerge document handle.
 */
export type LiveDoc<Doc extends Document<string>> = {
    /** The document data, suitable for use in reactive contexts.

    This data should never be mutated directly. Instead, call `changeDoc` or, if
    necessary, interact with the Automerge document handle.
     */
    doc: Doc;

    /** Call this function to make changes to the document. */
    changeDoc: (f: ChangeFn<Doc>) => void;

    /** The Automerge document handle for the document. */
    docHandle: DocHandle<Doc>;

    /** Permissions for the document retrieved from the backend. */
    permissions: Permissions;
};

/** Retrieve a live document from the backend.

When the user has write permissions, changes to the document will be propagated
by Automerge to the backend and to other clients. When the user has only read
permissions, the Automerge doc handle will be "fake", existing only locally in
the client. And if the user doesn't even have read permissions, this function
will yield an unauthorized error!
 */
export async function getLiveDoc<Doc extends Document<string>>(
    api: Api,
    refId: string,
    docType?: string,
): Promise<LiveDoc<Doc>> {
    invariant(uuid.validate(refId), () => `Invalid document ref ${refId}`);
    const { rpc, repo } = api;

    const result = await rpc.get_doc.query(refId);
    if (result.tag !== "Ok") {
        if (result.code === 403) {
            throw new PermissionsError(result.message);
        } else {
            throw new Error(`Failed to retrieve document: ${result.message}`);
        }
    }
    const refDoc = result.content;

    let docHandle: DocHandle<Doc>;
    if (refDoc.tag === "Live") {
        const docId = refDoc.docId as DocumentId;
        docHandle = repo.find(docId) as DocHandle<Doc>;
    } else {
        const init = refDoc.content as Doc;
        docHandle = localRepo.create(init);
    }

    const doc = await makeDocHandleReactive(docHandle);
    if (docType !== undefined) {
        invariant(
            doc.type === docType,
            () => `Expected document of type ${docType}, got ${doc.type}`,
        );
    }

    const changeDoc = (f: ChangeFn<Doc>) => docHandle.change(f);

    const permissions = refDoc.permissions;
    return { doc, changeDoc, docHandle, permissions };
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
