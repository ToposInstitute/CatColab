import { v7 } from "uuid";

import type { Document } from "catcolab-document-types";
import type { DocumentStore } from "catcolab-documents";

/**
 * A bespoke in-memory store whose handles are the documents themselves,
 * augmented with `getHandle` so notebooks containing instantiation cells can be
 * resolved. Handles are registered under a stable id by `createHandle`;
 * `getDocumentRef` is a plain lookup and `getHandle` its inverse. Each call
 * builds an independent store object, so each gets its own model cache (the
 * cache registry is keyed by store identity).
 *
 * `failOnResolve` makes `getHandle` return `undefined`, so resolution rejects
 * with "unknown model" — modelling a store that cannot fetch a referenced
 * document.
 */
export function createResolvingStore(): {
    store: DocumentStore<Document>;
    failOnResolve: { value: boolean };
} {
    const ids = new WeakMap<Document, string>();
    const byId = new Map<string, Document>();
    const listeners = new WeakMap<Document, Set<() => void>>();
    const failOnResolve = { value: false };

    const store: DocumentStore<Document> = {
        createHandle: async (initialDoc) => {
            const doc = initialDoc as Document;
            const id = v7();
            ids.set(doc, id);
            byId.set(id, doc);
            return doc;
        },
        getHandle: async (ref) => {
            const handle = failOnResolve.value ? undefined : byId.get(ref.id);
            return handle
                ? { tag: "Ok", content: handle }
                : {
                      tag: "Err",
                      content: [{ message: `Cannot resolve reference "${ref.id}".`, path: ["id"] }],
                  };
        },
        getDocumentView: (handle) => handle,
        changeDocument: (handle, fn) => {
            fn(handle);
            for (const listener of Array.from(listeners.get(handle) ?? [])) {
                listener();
            }
        },
        subscribe: (handle, callback) => {
            let set = listeners.get(handle);
            if (!set) {
                set = new Set();
                listeners.set(handle, set);
            }
            set.add(callback);
            return () => {
                set.delete(callback);
            };
        },
        copyValue: (_handle, value) => structuredClone(value),
        getDocumentRef: (handle) => {
            let id = ids.get(handle);
            if (!id) {
                id = v7();
                ids.set(handle, id);
                byId.set(id, handle);
            }
            return { id, version: null, server: "" };
        },
    };

    return { store, failOnResolve };
}
