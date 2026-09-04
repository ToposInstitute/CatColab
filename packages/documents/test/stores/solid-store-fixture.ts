import { createStore, reconcile, type SetStoreFunction, unwrap } from "solid-js/store";

import type { Document } from "catcolab-document-types";
// A SolidJS document store: keeps a draft document plus a Solid store view
// reconciled on every change.
import type { DocumentStore } from "catcolab-documents";

export type SolidStoreHandle = {
    draftDoc: Document;
    docView: Document;
    setDocView: SetStoreFunction<Document>;
    listeners: Set<() => void>;
};

// Every store mints a stable reference for its handles; this one assigns an id
// on demand and keeps it in a WeakMap.
const solidStoreIds = new WeakMap<SolidStoreHandle, string>();
const solidStoreIdFor = (handle: SolidStoreHandle): string => {
    let id = solidStoreIds.get(handle);
    if (!id) {
        id = crypto.randomUUID();
        solidStoreIds.set(handle, id);
    }
    return id;
};

// Handles minted by `createHandle`, so `listInstancesOf` can enumerate them.
// Drafts are excluded: only committed documents answer the query.
const createdHandles = new Set<SolidStoreHandle>();

export const solidStore: DocumentStore<SolidStoreHandle> = {
    async createHandle(initialDoc) {
        const draftDoc = structuredClone(initialDoc as Document);
        const [docView, setDocView] = createStore<Document>(initialDoc as Document);
        const handle = { draftDoc, docView, setDocView, listeners: new Set<() => void>() };
        createdHandles.add(handle);
        return handle;
    },
    changeDocument: (handle, fn) => {
        fn(handle.draftDoc);
        handle.setDocView(reconcile(structuredClone(handle.draftDoc), { key: "id" }));
        for (const listener of Array.from(handle.listeners)) {
            listener();
        }
    },
    createDraft: (handle) => {
        const draftDoc = structuredClone(handle.draftDoc);
        const [docView, setDocView] = createStore<Document>(draftDoc);
        return { draftDoc, docView, setDocView, listeners: new Set() };
    },
    commitDraft: (handle, draft) => {
        const before = structuredClone(handle.draftDoc);
        const after = structuredClone(draft.draftDoc);
        solidStore.changeDocument(handle, (document): void => {
            for (const key of Object.keys(document)) {
                delete (document as unknown as Record<string, unknown>)[key];
            }
            Object.assign(document, after);
        });
        return { before, after };
    },
    discardDraft: () => {},
    revertCommit: (handle, change) => {
        const before = structuredClone(change.before);
        solidStore.changeDocument(handle, (document): void => {
            for (const key of Object.keys(document)) {
                delete (document as unknown as Record<string, unknown>)[key];
            }
            Object.assign(document, before);
        });
    },
    subscribe: (handle, callback) => {
        handle.listeners.add(callback);
        return () => {
            handle.listeners.delete(callback);
        };
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
    getDocumentView: (handle) => handle.docView,
    getDocumentRef: (handle) => ({ id: solidStoreIdFor(handle), version: null, server: "" }),
    listInstancesOf: async (handle) =>
        [...createdHandles].filter((other) => {
            const doc = other.docView;
            return (
                other !== handle &&
                doc.type === "instance" &&
                doc.instanceOf._id === solidStoreIdFor(handle)
            );
        }),
    // Link resolution omitted for brevity.
    getHandle: async () => ({
        tag: "Err",
        content: [{ message: "This store cannot resolve references." }],
    }),
};
