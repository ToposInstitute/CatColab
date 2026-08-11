import { v7 } from "uuid";

import type { Document } from "catcolab-document-types";
import type { Result } from "../result";
import type { DocumentStore, DocumentRef } from "./document-store";

export function createInMemoryStore(): DocumentStore<Document> {
    const idToDocument = new Map<string, Document>();
    const documentToId = new WeakMap<Document, string>();
    const documentToCallbacks = new WeakMap<Document, Set<() => void>>();

    function requireDocumentId(handle: Document): string {
        const id = documentToId.get(handle);
        if (id === undefined) {
            throw new Error("Document handle is not registered with this store.");
        }
        return id;
    }

    return {
        async createHandle(initialDoc: Document): Promise<Document> {
            const uuid = v7();
            idToDocument.set(uuid, initialDoc);
            documentToCallbacks.set(initialDoc, new Set());
            documentToId.set(initialDoc, uuid);
            return initialDoc;
        },

        async getHandle(ref: DocumentRef): Promise<Result<Document>> {
            if (ref.server !== undefined && ref.server !== "") {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: "Cannot resolve non-local document from in-memory store.",
                        },
                    ],
                };
            }

            if (ref.version !== null) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: "Cannot resolve versioned document from in-memory store.",
                        },
                    ],
                };
            }

            const document = idToDocument.get(ref.id);
            if (document) {
                return { tag: "Ok", content: document };
            }

            return {
                tag: "Err",
                content: [{ message: `Unable to find document ${ref.id} in in-memory store.` }],
            };
        },

        changeDocument(handle: Document, fn: (doc: Document) => void): void {
            requireDocumentId(handle);
            fn(handle);

            // Make an array to prevent mutation of the callback set during iteration.
            for (const callback of Array.from(documentToCallbacks.get(handle)!)) {
                callback();
            }
        },

        subscribe(handle: Document, callback: () => void): () => void {
            requireDocumentId(handle);

            const callbacks = documentToCallbacks.get(handle)!;
            callbacks.add(callback);

            return () => {
                callbacks.delete(callback);
            };
        },

        copyValue<T>(handle: Document, value: T): T {
            requireDocumentId(handle);
            return structuredClone(value);
        },

        getDocumentRef(handle: Document): DocumentRef {
            return { id: requireDocumentId(handle), version: null };
        },

        getDocumentView(handle: Document): Readonly<Document> {
            requireDocumentId(handle);
            return handle;
        },
    };
}
