import { getBackend, getObjectId } from "@automerge/automerge";

import type { Document } from "catcolab-document-types";
import {
    type Binder,
    createBinder,
    type DocumentRef,
    type DocumentStore,
    type Result,
} from "catcolab-documents";
import type { LiveDoc } from "./document";
import type { Api } from "./types";

export type ApiDocumentHandle = {
    liveDoc: LiveDoc;
    ref: DocumentRef;
};

export type ApiDocumentStore = DocumentStore<ApiDocumentHandle> & {
    register<Doc extends Document>(ref: DocumentRef, liveDoc: LiveDoc<Doc>): ApiDocumentHandle;
};

/** A binder over the API document store, with access to its backing store. */
export type ApiBinder = Binder<ApiDocumentHandle> & {
    store: ApiDocumentStore;
};

/** Create a binder over the document store for an API client.

The binder should be created once per API client and shared across the
application (via context) so that document handles are cached and deduplicated
between loads.
 */
export function createApiBinder(api: Api): ApiBinder {
    const store = createApiDocumentStore(api);
    return Object.assign(createBinder(store), { store });
}

/** Adapt frontend live documents to the storage boundary used by catcolab-documents. */
export function createApiDocumentStore(api: Api): ApiDocumentStore {
    const handles = new Map<string, ApiDocumentHandle>();

    const register = <Doc extends Document>(ref: DocumentRef, liveDoc: LiveDoc<Doc>) => {
        const existing = handles.get(ref.id);
        if (existing) {
            return existing;
        }
        const handle = { liveDoc: liveDoc as unknown as LiveDoc, ref };
        handles.set(ref.id, handle);
        return handle;
    };

    return {
        register,
        async createHandle(initialDoc) {
            const refId = await api.createDoc(initialDoc);
            const { liveDoc } = await api.getLiveDoc(refId, initialDoc.type);
            return register({ id: refId, version: null, server: api.serverHost }, liveDoc);
        },
        getDocumentView: (handle) => handle.liveDoc.doc,
        changeDocument: (handle, fn) => handle.liveDoc.changeDoc(fn),
        subscribe: (handle, callback) => {
            handle.liveDoc.docHandle.on("change", callback);
            return () => handle.liveDoc.docHandle.off("change", callback);
        },
        copyValue: (handle, value) => {
            if (typeof value !== "object" || value === null) {
                return value;
            }
            const objectId = getObjectId(value);
            if (!objectId) {
                return structuredClone(value);
            }
            return getBackend(handle.liveDoc.docHandle.doc()).materialize(objectId) as typeof value;
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

            const cached = handles.get(ref.id);
            if (cached) {
                return { tag: "Ok", content: cached };
            }
            try {
                const { liveDoc } = await api.getLiveDoc(ref.id);
                return { tag: "Ok", content: register(ref, liveDoc) };
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
