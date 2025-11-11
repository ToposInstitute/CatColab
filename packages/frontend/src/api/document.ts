import type {
    AnyDocumentId,
    ChangeFn,
    DocHandle,
    DocHandleChangePayload,
    Repo,
} from "@automerge/automerge-repo";
import type { Permissions } from "catcolab-api";
import { type Document, migrateDocument } from "catlog-wasm";
import jsonpatch from "fast-json-patch";
import { type Accessor, createEffect, createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import invariant from "tiny-invariant";

/** Live document, typically retrieved from the backend.

A live document can be used in reactive contexts and is connected to an
Automerge document handle.
 */
export type LiveDoc<Doc extends Document = Document> = {
    /** The document data, suitable for use in reactive contexts.

    This data should never be mutated directly. Instead, call `changeDoc` or, if
    necessary, use the Automerge document handle.
     */
    doc: Doc;

    /** Call this function to make changes to the document. */
    changeDoc: (f: ChangeFn<Doc>) => void;

    /** The Automerge document handle for the document. */
    docHandle: DocHandle<Doc>;

    /** Associated document ref in the backend, if any.

    In typical usage of the official CatColab frontend and backend, this field
    will be set, but lower-level components in the frontend are decoupled from
    the backend, relying on Automerge only.
     */
    docRef?: DocRef;
};

/** The type discriminator for documents */
export type DocumentType = Document["type"];

/** Info about a document ref in the CatColab backend. */
export type DocRef = {
    /** ID of the document ref. */
    refId: string;

    /** Permissions for the document ref. */
    permissions: Permissions;

    /** Whether the document has been deleted. */
    isDeleted: boolean;
};

/** Gets a document from an Automerge repo, migrating it if necessary.

Prefer calling this function over calling `Repo.find` directly to ensure that
any necessary migrations are performed before the data is accessed.
 */
export async function findAndMigrate<Doc extends Document>(
    repo: Repo,
    docId: AnyDocumentId,
    docType?: Doc["type"],
): Promise<DocHandle<Doc>> {
    const docHandle = await repo.find<Doc>(docId);

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

    if (docType !== undefined) {
        const actualType = docHandle.doc().type;
        invariant(
            actualType === docType,
            () => `Expected document of type ${docType}, got ${actualType}`,
        );
    }
    return docHandle;
}

/** Create a live document from an Automerge document handle.

When using the official CatColab backend, this function should be called only
indirectly, via [`getLiveDoc`]. However, if you want to bypass the CatColab
backend and fetch a document from another Automerge repo, you can call this
function directly.
 */
export function makeLiveDoc<Doc extends Document>(
    docHandle: DocHandle<Doc>,
    docRef?: DocRef,
): LiveDoc<Doc> {
    const doc = makeDocHandleReactive(docHandle);
    const changeDoc = (f: ChangeFn<Doc>) => docHandle.change(f);
    return { doc, changeDoc, docHandle, docRef };
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
