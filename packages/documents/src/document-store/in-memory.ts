import { parse as uuidParse, stringify as uuidStringify, v7, validate as uuidValidate } from "uuid";

import type { Document } from "catcolab-document-types";
import type { MetaDocument, MetaDocumentData } from "../meta_document";
import type { Result } from "../result";
import type { DeepReadonly } from "../util/deep-readonly";
import type { DocumentChange, DocumentStore, DocumentRef } from "./document-store";
import { documentLinks } from "./document-store";

/** Create a document snapshot. */
export function createDocumentSnapshot(document: DeepReadonly<Document>): DeepReadonly<Document> {
    return structuredClone(document);
}

/** Create an in-memory meta document for in-memory document stores. */
function createInMemoryMetaDocument(): {
    doc: MetaDocument;
    replace(data: MetaDocumentData): void;
} {
    let snapshot: DeepReadonly<MetaDocumentData> = {
        profile: { username: null, displayName: null },
        knownUsers: {},
        documents: {},
    };
    const listeners = new Set<() => void>();

    const meta: MetaDocument = {
        data: () => snapshot,
        onChange(callback) {
            listeners.add(callback);
            return (): void => {
                listeners.delete(callback);
            };
        },
    };

    return {
        doc: meta,
        replace(data): void {
            snapshot = structuredClone(data);
            for (const callback of Array.from(listeners)) {
                callback();
            }
        },
    };
}

export function createInMemoryStore(): DocumentStore<Document, Document> {
    const meta = createInMemoryMetaDocument();
    const idToDocument = new Map<string, Document>();
    const documentToId = new WeakMap<Document, string>();
    const documentToCallbacks = new WeakMap<Document, Set<(handle: Document) => void>>();
    const snapshots = new WeakMap<Document, DeepReadonly<Document>>();
    const drafts = new WeakSet<Document>();
    const pending: Array<{
        handle: Document;
        callbacks: Array<(handle: Document) => void>;
    }> = [];
    let notifying = false;

    function requireDocumentId(handle: Document): string {
        const id = documentToId.get(handle);
        if (id === undefined) {
            throw new Error("Document handle is not registered with this store.");
        }
        return id;
    }

    function syncMetadata(): void {
        const data = structuredClone(meta.doc.data()) as MetaDocumentData;
        for (const [id, document] of idToDocument) {
            if (drafts.has(document)) {
                continue;
            }
            const previous = data.documents[id];
            const now = Date.now();
            data.documents[id] = {
                createdAt: now,
                deletedAt: null,
                ...previous,
                name: document.name,
                typeName: document.type,
                dependsOn: documentLinks(document)
                    .filter((link) => uuidValidate(link._id))
                    .map((link) => ({ refId: uuidParse(link._id), relationType: link.type })),
                usedBy: [],
            };
        }
        for (const [id, document] of Object.entries(data.documents)) {
            for (const link of document?.dependsOn ?? []) {
                const target = data.documents[uuidStringify(link.refId)];
                target?.usedBy.push({ refId: uuidParse(id), relationType: link.relationType });
            }
        }
        meta.replace(data);
    }

    function notify(handle: Document): void {
        const snapshot = createDocumentSnapshot(handle);
        snapshots.set(handle, snapshot);
        if (!drafts.has(handle)) {
            syncMetadata();
        }
        pending.push({ handle, callbacks: Array.from(documentToCallbacks.get(handle) ?? []) });
        if (notifying) {
            return;
        }
        notifying = true;
        try {
            while (pending.length > 0) {
                const event = pending.shift()!;
                for (const callback of event.callbacks) {
                    callback(event.handle);
                }
            }
        } finally {
            notifying = false;
            pending.length = 0;
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
            snapshots.delete(draft);
        }
    }

    return {
        meta: meta.doc,
        async createHandle(initialDoc: Document): Promise<Document> {
            const uuid = v7();
            idToDocument.set(uuid, initialDoc);
            documentToCallbacks.set(initialDoc, new Set());
            snapshots.set(initialDoc, createDocumentSnapshot(initialDoc));
            documentToId.set(initialDoc, uuid);
            syncMetadata();
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

        subscribe(handle: Document, callback: (handle: Document) => void): () => void {
            requireDocumentId(handle);

            const callbacks = documentToCallbacks.get(handle)!;
            callbacks.add(callback);

            return () => {
                callbacks.delete(callback);
            };
        },

        getDocumentRef(handle: Document): DocumentRef {
            return { id: requireDocumentId(handle), version: null };
        },

        getDocumentSnapshot(handle: Document): DeepReadonly<Document> {
            requireDocumentId(handle);
            return snapshots.get(handle)!;
        },

        createDraft(handle: Document): Document {
            requireDocumentId(handle);
            const draft = structuredClone(handle);
            const id = `draft-${v7()}`;
            idToDocument.set(id, draft);
            documentToId.set(draft, id);
            documentToCallbacks.set(draft, new Set());
            snapshots.set(draft, createDocumentSnapshot(draft));
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
