import { v7 } from "uuid";

import type { Document } from "catcolab-document-types";
import type { Result } from "./result";

export interface DocumentRef {
    readonly id: string;
    readonly version: string | null;
    readonly server?: string;
}

export interface DocumentStore<Handle> {
    createHandle(initialDoc: Document): Promise<Handle>;
    getHandle(ref: DocumentRef): Promise<Result<Handle>>;
    changeDocument(handle: Handle, fn: (document: Document) => void): void;
    subscribe(handle: Handle, callback: () => void): () => void;
    copyValue<T>(handle: Handle, value: T): T;
    getDocumentRef(handle: Handle): DocumentRef;
    getDocumentView(handle: Handle): Readonly<Document>;
}

export function createPlainDocumentStore(): DocumentStore<Document> {
    const documents = new Map<string, Document>();
    const documentIds = new WeakMap<Document, string>();
    const listeners = new WeakMap<Document, Set<() => void>>();

    const idFor = (document: Document): string => {
        const id = documentIds.get(document);
        if (!id) {
            throw new Error("Document handle is not registered with this store.");
        }
        return id;
    };

    return {
        async createHandle(initialDoc) {
            const handle = structuredClone(initialDoc);
            const id = v7();
            documentIds.set(handle, id);
            documents.set(id, handle);
            return handle;
        },
        async getHandle(ref) {
            const handle =
                ref.version === null && (ref.server === undefined || ref.server === "")
                    ? documents.get(ref.id)
                    : undefined;
            return handle
                ? { tag: "Ok", content: handle }
                : {
                      tag: "Err",
                      content: [{ message: `Cannot resolve reference "${ref.id}".`, path: ["id"] }],
                  };
        },
        changeDocument(handle, fn) {
            fn(handle);
            for (const listener of Array.from(listeners.get(handle) ?? [])) {
                listener();
            }
        },
        subscribe(handle, callback) {
            let callbacks = listeners.get(handle);
            if (!callbacks) {
                callbacks = new Set();
                listeners.set(handle, callbacks);
            }
            callbacks.add(callback);
            return () => callbacks.delete(callback);
        },
        copyValue(_handle, value) {
            return structuredClone(value);
        },
        getDocumentRef(handle) {
            return { id: idFor(handle), version: null, server: "" };
        },
        getDocumentView(handle) {
            return handle;
        },
    };
}
