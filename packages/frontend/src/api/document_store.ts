import type { DocHandle } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import { createStore, reconcile, unwrap } from "solid-js/store";

import type { Document } from "catcolab-document-types";
import {
    type Binder,
    createBinder,
    type DocumentRef,
    type DocumentStore,
    type Result,
} from "catcolab-documents";
import type { Api } from "./types";

export type ApiDocumentHandle = {
    automergeHandle: DocHandle<Document>;

    /** Fine-grained reactive view of the document, for use in SolidJS contexts. */
    docView: Document;

    ref: DocumentRef;
};

export type ApiDocumentStore = DocumentStore<ApiDocumentHandle>;

/** A binder over the API document store. */
export type ApiBinder = Binder<ApiDocumentHandle>;

/** Create a binder over the document store for an API client.

The binder should be created once per API client and shared across the
application (via context) so that document handles are cached and deduplicated
between loads.
 */
export function createApiBinder(api: Api): ApiBinder {
    return createBinder(createApiDocumentStore(api));
}

/** Adapt frontend Automerge documents to the storage boundary used by catcolab-documents. */
export function createApiDocumentStore(api: Api): ApiDocumentStore {
    const handles = new Map<string, ApiDocumentHandle>();

    const cacheHandle = (ref: DocumentRef, automergeHandle: DocHandle<Document>) => {
        const existing = handles.get(ref.id);
        if (existing) {
            existing.ref = ref;
            return existing;
        }
        const handle = { automergeHandle, docView: makeDocumentProjection(automergeHandle), ref };
        handles.set(ref.id, handle);
        return handle;
    };

    return {
        async createHandle(initialDoc) {
            const refId = await api.createDoc(initialDoc);
            const automergeHandle = await api.getDocHandle(refId);
            return cacheHandle(
                { id: refId, version: null, server: api.serverHost },
                automergeHandle,
            );
        },
        getDocumentView: (handle) => handle.docView,
        changeDocument: (handle, fn) => handle.automergeHandle.change(fn),
        subscribe: (handle, callback) => {
            handle.automergeHandle.on("change", callback);
            return () => handle.automergeHandle.off("change", callback);
        },
        copyValue: (_handle, value) => structuredClone(unwrap(value)),
        createReactiveView(initial) {
            const [current, setCurrent] = createStore(initial);
            return {
                current,
                replace(next) {
                    setCurrent(reconcile(next));
                },
            };
        },
        getDocumentRef: (handle) => handle.ref,
        async getHandle(ref: DocumentRef): Promise<Result<ApiDocumentHandle>> {
            if (ref.version !== null) {
                return {
                    tag: "Err",
                    content: [
                        { message: "Pinned document refs are not supported.", path: ["version"] },
                    ],
                };
            }
            if (ref.server && ref.server !== api.serverHost) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: `Cannot resolve a document on server "${ref.server}".`,
                            path: ["server"],
                        },
                    ],
                };
            }
            const canonicalRef = { ...ref, server: ref.server || api.serverHost };

            const cached = handles.get(ref.id);
            if (cached) {
                cached.ref = canonicalRef;
                return { tag: "Ok", content: cached };
            }
            try {
                const automergeHandle = await api.getDocHandle(ref.id);
                return { tag: "Ok", content: cacheHandle(canonicalRef, automergeHandle) };
            } catch (error) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: error instanceof Error ? error.message : String(error),
                            path: ["id"],
                        },
                    ],
                };
            }
        },
    };
}
