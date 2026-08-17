import { unwrap } from "solid-js/store";

import type { Document } from "catcolab-document-types";
import type { DocumentRef, DocumentStore, Result } from "catcolab-documents";
import type { LiveDocWithRef } from "./document";
import type { Api } from "./types";

export type ApiDocumentHandle = LiveDocWithRef<Document>;

export type DocumentStoreApi = Pick<Api, "createDoc" | "getLiveDoc" | "serverHost">;

export function createApiDocumentStore(api: DocumentStoreApi): DocumentStore<ApiDocumentHandle> {
    const handles = new Map<string, ApiDocumentHandle>();

    async function getOrCreateHandle(refId: string): Promise<ApiDocumentHandle> {
        const existing = handles.get(refId);
        if (existing) {
            return existing;
        }

        const handle: ApiDocumentHandle = await api.getLiveDoc<Document>(refId);
        handles.set(refId, handle);
        return handle;
    }

    const store: DocumentStore<ApiDocumentHandle> = {
        async createHandle(initialDoc: Document): Promise<ApiDocumentHandle> {
            const refId = await api.createDoc(initialDoc);
            return getOrCreateHandle(refId);
        },
        async getHandle(ref: DocumentRef): Promise<Result<ApiDocumentHandle>> {
            if (ref.version !== null) {
                return {
                    tag: "Err",
                    content: [{ message: "Versioned document references are not supported." }],
                };
            }
            if (ref.server && ref.server !== api.serverHost) {
                return {
                    tag: "Err",
                    content: [
                        { message: `Cannot resolve a document from server "${ref.server}".` },
                    ],
                };
            }

            try {
                return { tag: "Ok", content: await getOrCreateHandle(ref.id) };
            } catch (error: unknown) {
                return {
                    tag: "Err",
                    content: [{ message: `Cannot resolve document "${ref.id}": ${String(error)}` }],
                };
            }
        },
        changeDocument(handle: ApiDocumentHandle, fn: (doc: Document) => void): void {
            handle.liveDoc.changeDoc(fn);
        },
        subscribe(handle: ApiDocumentHandle, callback: () => void): () => void {
            const onChange = (): void => callback();
            handle.liveDoc.docHandle.on("change", onChange);
            return () => handle.liveDoc.docHandle.off("change", onChange);
        },
        copyValue<T>(_handle: ApiDocumentHandle, value: T): T {
            return structuredClone(unwrap(value));
        },
        getDocumentRef(handle: ApiDocumentHandle): DocumentRef {
            return {
                id: handle.docRef.refId,
                version: null,
                server: api.serverHost,
            };
        },
        getDocumentView(handle: ApiDocumentHandle): Readonly<Document> {
            return handle.liveDoc.doc;
        },
    };

    return store;
}
