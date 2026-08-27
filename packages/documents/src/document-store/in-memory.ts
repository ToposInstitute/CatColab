import { v7 } from "uuid";

import type { Document } from "catcolab-document-types";
import type { Result } from "../result";
import type { DocumentChange, DocumentStore, DocumentRef } from "./document-store";

export function createInMemoryStore(): DocumentStore<Document, Document> {
    const idToDocument = new Map<string, Document>();
    const documentToId = new WeakMap<Document, string>();
    const documentToCallbacks = new WeakMap<Document, Set<() => void>>();
    const drafts = new WeakSet<Document>();

    function requireDocumentId(handle: Document): string {
        const id = documentToId.get(handle);
        if (id === undefined) {
            throw new Error("Document handle is not registered with this store.");
        }
        return id;
    }

    function notify(handle: Document): void {
        // Make an array to prevent mutation of the callback set during iteration.
        for (const callback of Array.from(documentToCallbacks.get(handle) ?? [])) {
            callback();
        }
    }

    /** Overwrite every key of `handle`'s document with a copy of `replacement`. */
    function replaceContents(handle: Document, replacement: Document): void {
        const mutable = handle as unknown as Record<string, unknown>;
        for (const key of Object.keys(mutable)) {
            delete mutable[key];
        }
        Object.assign(mutable, structuredClone(replacement));
        notify(handle);
    }

    /** Stop tracking a draft once it has been committed or abandoned. */
    function forgetDraft(draft: Document): void {
        if (drafts.delete(draft)) {
            const id = documentToId.get(draft);
            if (id !== undefined) {
                idToDocument.delete(id);
            }
            documentToId.delete(draft);
            documentToCallbacks.delete(draft);
        }
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
            notify(handle);
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

        createDraft(handle: Document): Document {
            requireDocumentId(handle);
            const draft = structuredClone(handle);
            const id = `draft-${v7()}`;
            idToDocument.set(id, draft);
            documentToId.set(draft, id);
            documentToCallbacks.set(draft, new Set());
            drafts.add(draft);
            return draft;
        },

        commitDraft(handle: Document, draft: Document): DocumentChange<Document> {
            requireDocumentId(handle);

            const before = structuredClone(handle);
            replaceContents(handle, draft);
            forgetDraft(draft);
            return { before, after: structuredClone(handle) };
        },

        discardDraft(draft: Document): void {
            forgetDraft(draft);
        },

        revertCommit(handle: Document, change: DocumentChange<Document>): void {
            requireDocumentId(handle);

            replaceContents(handle, change.before);
        },
    };
}
