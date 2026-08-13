// RFC-0006 "Use with SolidJS and Automerge" — the Automerge binder.
//
// A simple Automerge store: handles are `DocHandle`s in a `Repo`, changes go
// through `DocHandle.change`, and copied values are materialized off the
// Automerge backend.
import { getBackend, getObjectId } from "@automerge/automerge";
import { type DocHandle, Repo } from "@automerge/automerge-repo";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
import { createBinder, type DocumentStore } from "catcolab-documents";

const repo = new Repo();

const automergeStore: DocumentStore<DocHandle<Document>> = {
    createHandle: async (initialDoc) => {
        return repo.create<Document>(initialDoc as Document);
    },
    changeDocument: (handle, fn) => handle.change(fn),
    subscribe: (handle, callback) => {
        const onChange = () => callback();
        handle.on("change", onChange);
        return () => handle.off("change", onChange);
    },
    copyValue: (handle, value) => {
        const doc = handle.doc();
        const objId = getObjectId(value as object);
        if (objId === null) {
            throw new Error("value is not part of the document");
        }
        return getBackend(doc).materialize(objId) as typeof value;
    },
    getDocumentView: (handle) => handle.doc(),
    getDocumentRef: (handle) => ({ id: handle.documentId, version: null, server: "" }),
    // Link resolution omitted for brevity.
    getHandle: async () => ({
        tag: "Err",
        content: [{ message: "This store cannot resolve references." }],
    }),
};

describe("Automerge binder", () => {
    test("a binder over an Automerge store is used just as the default binder", async () => {
        const automergeBinder = createBinder(automergeStore);

        const notebook = await automergeBinder.createNotebook(SimpleOlog, { title: "An Olog" });
        expect(notebook.title).toBe("An Olog");
    });

    test("edits are persisted in the Automerge document", async () => {
        // This minimal store snapshots its view per handle, so it demonstrates
        // creation and persistence; a store with *live* reads projects its
        // handle instead (see backend-store.test.ts).
        const automergeBinder = createBinder(automergeStore);

        const notebook = await automergeBinder.createNotebook(SimpleOlog, { title: "An Olog" });
        notebook.add(Type, { label: "A" });
        notebook.add(Type, { label: "B" });

        const reloaded = await automergeBinder.loadNotebook(SimpleOlog, notebook.dump());
        expect(reloaded.tag).toBe("Ok");
        if (reloaded.tag !== "Ok") {
            return;
        }
        expect(reloaded.content.cellsOf(Type).map((cell) => cell.label)).toEqual(["A", "B"]);
    });
});
