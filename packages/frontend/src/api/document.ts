import {
    type ChangeFn,
    type DocHandle,
    type DocHandleChangePayload,
    type DocumentId,
    Repo,
} from "@automerge/automerge-repo";
import jsonpatch from "fast-json-patch";
import { type Accessor, createEffect, createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import invariant from "tiny-invariant";
import * as uuid from "uuid";

import { type Document, migrateDocument } from "catlog-wasm";
import { PermissionsError } from "../util/errors";
import type { InterfaceToType } from "../util/types";
import type { Api, LiveDoc } from "./types";

/** An Automerge repo with no networking, used for read-only documents. */
const localRepo = new Repo();

/** Retrieve a live document from the backend.

When the user has write permissions, changes to the document will be propagated
by Automerge to the backend and to other clients. When the user has only read
permissions, the Automerge doc handle will be "fake", existing only locally in
the client. And if the user doesn't even have read permissions, this function
will yield an unauthorized error!
 */
export async function getLiveDoc<Doc extends Document>(
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
        docHandle = (await repo.find(docId)) as DocHandle<Doc>;
    } else {
        const init = refDoc.content as unknown as Doc;
        docHandle = localRepo.create(init);
    }

    const { permissions } = refDoc;
    return {
        ...getLiveDocFromDocHandle(docHandle, docType),
        docRef: {
            refId,
            permissions,
        },
    };
}

/** Create a live document from an Automerge document handle.

When using the official CatColab backend, this function should be called only
indirectly, via [`getLiveDoc`]. However, if you want to bypass the CatColab
backend and fetch a document from another Automerge repo, you can call this
function directly.
 */
export function getLiveDocFromDocHandle<Doc extends Document>(
    docHandle: DocHandle<Doc>,
    docType?: string,
): LiveDoc<Doc> {
    // Perform any migrations on the document.
    // XXX: copied from automerge-doc-server/src/server.ts:
    const docBefore = docHandle.doc();
    const docAfter = migrateDocument(docBefore);
    if ((docBefore as Doc).version !== docAfter.version) {
        const patches = jsonpatch.compare(docBefore as Doc, docAfter);
        docHandle.change((doc: unknown) => {
            jsonpatch.applyPatch(doc, patches);
        });
    }

    const doc = makeDocHandleReactive(docHandle);
    if (docType !== undefined) {
        invariant(
            doc.type === docType,
            () => `Expected document of type ${docType}, got ${doc.type}`,
        );
    }

    const changeDoc = (f: ChangeFn<Doc>) => docHandle.change(f);

    return { doc, changeDoc, docHandle };
}

/** Create a new document in the backend, returning its ref ID. */
export async function createDoc(api: Api, init: Document): Promise<string> {
    const result = await api.rpc.new_ref.mutate(init as InterfaceToType<Document>);
    invariant(result.tag === "Ok", `Failed to create a new ${init.type}`);

    return result.content;
}

/** Duplicate a document in the backend, returning the new ref ID. */
export async function duplicateDoc(api: Api, doc: Document): Promise<string> {
    const init: Document = {
        ...doc,
        name: `${doc.name} (copy)`,
    };

    const result = await api.rpc.new_ref.mutate(init as InterfaceToType<Document>);
    invariant(result.tag === "Ok", `Failed to duplicate the ${doc.type}`);

    return result.content;
}

/** Create a Solid Store that tracks an Automerge document. */
export function makeDocHandleReactive<T extends object>(handle: DocHandle<T>): T {
    const init = handle.doc();

    const [store, setStore] = createStore<T>(init as T);

    const onChange = (payload: DocHandleChangePayload<T>) => {
        // Use [`reconcile`](https://www.solidjs.com/tutorial/stores_immutable)
        // function to diff the data and thus avoid re-rendering the whole DOM.
        setStore(reconcile(payload.doc));
    };

    handle.on("change", onChange);

    return store;
}

/** Create a boolean signal for whether an Automerge document handle is ready. */
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
