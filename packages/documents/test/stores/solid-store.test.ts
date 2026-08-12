import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createStore, reconcile, type SetStoreFunction, unwrap } from "solid-js/store";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
// RFC-0006 "Use with SolidJS and Automerge" — the SolidJS binder.
//
// The `Binder` abstraction keeps the API consistent while plugging in custom
// backends through `createBinder` and the `DocumentStore` type. A simple
// SolidJS store keeps a draft document plus a Solid store view reconciled on
// every change.
import { createBinderWithStore, type DocumentStore } from "catcolab-documents";

type SolidStoreHandle = {
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

const solidStore: DocumentStore<SolidStoreHandle> = {
    async createHandle(initialDoc) {
        const draftDoc = structuredClone(initialDoc as Document);
        const [docView, setDocView] = createStore<Document>(initialDoc as Document);
        return { draftDoc, docView, setDocView, listeners: new Set() };
    },
    changeDocument: (handle, fn) => {
        fn(handle.draftDoc);
        handle.setDocView(reconcile(structuredClone(handle.draftDoc), { key: "id" }));
        for (const listener of Array.from(handle.listeners)) {
            listener();
        }
    },
    subscribe: (handle, callback) => {
        handle.listeners.add(callback);
        return () => {
            handle.listeners.delete(callback);
        };
    },
    copyValue: (_handle, value) => structuredClone(unwrap(value)),
    getDocumentView: (handle) => handle.docView,
    getDocumentRef: (handle) => ({ id: solidStoreIdFor(handle), version: null, server: "" }),
    // Link resolution omitted for brevity.
    getHandle: async () => ({
        tag: "Err",
        content: [{ message: "This store cannot resolve references." }],
    }),
};

describe("SolidJS binder", () => {
    // Still pending: `cellsOf` is not implemented yet.
    test.skip("a binder over a Solid store is used just as the default binder", async () => {
        const solidBinder = createBinderWithStore(solidStore);

        const notebook = await solidBinder.createNotebook(SimpleOlog, { title: "An Olog" });
        expect(notebook.title).toBe("An Olog");

        const a = notebook.add(Type, { label: "A" });
        notebook.add(Type, { label: "B" });

        expect(notebook.cellsOf(Type).map((cell) => cell.label)).toEqual(["A", "B"]);

        a.update({ label: "A2" });
        expect(a.label).toBe("A2");
    });

    test("changes notify subscribers through the store", async () => {
        const solidBinder = createBinderWithStore(solidStore);
        const notebook = await solidBinder.createNotebook(SimpleOlog, { title: "An Olog" });

        let changes = 0;
        const unsubscribe = notebook.onChange(() => {
            changes += 1;
        });

        notebook.add(Type, { label: "A" });
        expect(changes).toBeGreaterThan(0);

        unsubscribe();

        const afterUnsubscribe = changes;
        notebook.add(Type, { label: "B" });
        expect(changes).toBe(afterUnsubscribe);
    });

    test("reads and writes go through the store's document view", async () => {
        const solidBinder = createBinderWithStore(solidStore);
        const notebook = await solidBinder.createNotebook(SimpleOlog, { title: "An Olog" });

        const a = notebook.add(Type, { label: "A" });
        expect(a.label).toBe("A");

        a.update({ label: "A2" });
        expect(a.label).toBe("A2");

        notebook.update({ title: "Another Olog" });
        expect(notebook.title).toBe("Another Olog");
    });
});
