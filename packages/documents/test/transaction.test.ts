// Notebook transactions: `notebook.beginTransaction()` opens a full notebook of
// the same shape over a private store *draft*; mutations through it are
// invisible on the source notebook until `commit()` merges them back
// in one step, and the returned `Commit` undoes the whole batch via
// `notebook.revertCommit(commit)`.
//
//     const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });
//     const tx = schema.beginTransaction();
//     tx.add(Entity, { label: "Person" });
//     const commit = tx.commit();
//     schema.revertCommit(commit); // undo
//
// Exercised against the two stores that implement the optional draft methods:
//
//   * an Automerge-backed store, where a draft is a `Repo.clone` into a private
//     draft repo, a commit is the span of heads across `DocHandle.merge`, and
//     undo applies the *inverse diff* of that span — so edits made after the
//     commit survive a revert;
//   * the plain in-memory store, where drafts and commits are whole-document
//     `structuredClone` snapshots and undo is a *rollback* to the commit's
//     `before` snapshot.
import type { Heads } from "@automerge/automerge";
import { type DocHandle, type DocumentId, Repo } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { createRoot } from "solid-js";
import { v7 } from "uuid";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
import { createBinder, type DocumentStore, plainStore } from "catcolab-documents";
import {
    commitDraftDocHandle,
    createDraftDocHandle,
    undoDocHandleCommit,
} from "./automerge_transactions";

// ---------------------------------------------------------------------------
// A minimal Automerge-backed store: `Repo` documents plus the three optional
// draft methods that make transactions available. `Heads` is the commit
// `Version`.
//
// The read view is a Solid projection of the Automerge document, so notebook
// reads are reactive. Reverting a commit that added cells produces map-key
// deletions on the projection; `makeDocumentProjection`'s bundled patch
// applier handles those only via this package's patch of
// `@automerge/automerge-repo-solid-primitives` (mirroring
// automerge/automerge#1308). Unpatched it throws
// `RangeError: index is not a number for patch`.
// ---------------------------------------------------------------------------
type StoreHandle = {
    docHandle: DocHandle<Document>;
    docView: Document;
};

function createAutomergeStore(): DocumentStore<StoreHandle, Heads> {
    const repo = new Repo();

    // The projection registers Solid cleanups, so build it inside a root.
    const makeHandle = (docHandle: DocHandle<Document>): StoreHandle => ({
        docHandle,
        docView: createRoot(() => makeDocumentProjection(docHandle)),
    });

    const handleByRefId = new Map<string, StoreHandle>();
    const refByDocId = new Map<DocumentId, string>();

    return {
        createHandle: async (initialDoc) => {
            const docHandle = repo.create<Document>(initialDoc);
            const handle = makeHandle(docHandle);
            const refId = v7();
            handleByRefId.set(refId, handle);
            refByDocId.set(docHandle.documentId, refId);
            return handle;
        },
        getHandle: async (ref) => {
            const handle = handleByRefId.get(ref.id);
            return handle
                ? { tag: "Ok", content: handle }
                : {
                      tag: "Err",
                      content: [{ message: `Cannot resolve reference "${ref.id}".`, path: ["id"] }],
                  };
        },
        getDocumentView: (handle) => handle.docView,
        changeDocument: (handle, fn) => handle.docHandle.change(fn),

        // A draft shares history with the original, so its changes merge back
        // sensibly at commit time; undo applies the commit's inverse diff. See
        // `automerge_transactions.ts`.
        createDraft: (handle) => makeHandle(createDraftDocHandle(handle.docHandle)),
        commitDraft: (handle, draft) => commitDraftDocHandle(handle.docHandle, draft.docHandle),
        revertCommit: (handle, commit) => undoDocHandleCommit(handle.docHandle, commit),

        subscribe: (handle, callback) => {
            handle.docHandle.on("change", callback);
            return () => handle.docHandle.off("change", callback);
        },
        // The view is already a detached plain object, so a copy is a clone.
        copyValue: (_handle, value) => structuredClone(value),
        getDocumentRef: (handle) => {
            const refId = refByDocId.get(handle.docHandle.documentId);
            if (!refId) {
                throw new Error("handle is not registered with this store");
            }
            return { id: refId, version: null, server: "" };
        },
    };
}

describe("notebook transactions (Automerge store)", () => {
    test("transaction mutations are invisible until commit, then land at once", async () => {
        const binder = createBinder(createAutomergeStore());
        const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const tx = schema.beginTransaction();
        tx.add(Entity, { label: "Person" });
        tx.add(Entity, { label: "Company" });

        // The draft sees its own mutations; the source notebook sees nothing.
        expect(tx.cellsOf(Entity).map((cell) => cell.label)).toEqual(["Person", "Company"]);
        expect(schema.cellsOf(Entity)).toHaveLength(0);

        const commit = tx.commit();
        expect(schema.cellsOf(Entity).map((cell) => cell.label)).toEqual(["Person", "Company"]);

        // Undo the whole transaction.
        schema.revertCommit(commit);
        expect(schema.cellsOf(Entity)).toHaveLength(0);
    });

    test("edits made after a commit survive its revert (inverse diff, not rollback)", async () => {
        const binder = createBinder(createAutomergeStore());
        const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const tx = schema.beginTransaction();
        tx.add(Entity, { label: "Person" });
        const commit = tx.commit();

        // An ordinary edit after the commit...
        schema.add(Entity, { label: "Company" });

        // ...survives reverting the transaction.
        schema.revertCommit(commit);
        expect(schema.cellsOf(Entity).map((cell) => cell.label)).toEqual(["Company"]);
    });

    test("a transaction is one-shot: committing twice throws", async () => {
        const binder = createBinder(createAutomergeStore());
        const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const tx = schema.beginTransaction();
        tx.add(Entity, { label: "Person" });
        tx.commit();
        expect(() => tx.commit()).toThrow(/already been committed/);
    });
});

describe("notebook transactions (plain store)", () => {
    test("the same transaction flow works on the plain in-memory store", async () => {
        const binder = createBinder(plainStore);
        const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const tx = schema.beginTransaction();
        tx.add(Entity, { label: "Person" });
        expect(schema.cellsOf(Entity)).toHaveLength(0);

        const commit = tx.commit();
        expect(schema.cellsOf(Entity).map((cell) => cell.label)).toEqual(["Person"]);

        schema.revertCommit(commit);
        expect(schema.cellsOf(Entity)).toHaveLength(0);
    });

    test("plain-store revert is a rollback: edits made after the commit are lost", async () => {
        const binder = createBinder(plainStore);
        const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const tx = schema.beginTransaction();
        tx.add(Entity, { label: "Person" });
        const commit = tx.commit();

        schema.add(Entity, { label: "Company" });

        // Unlike the Automerge store's inverse diff, the plain store rolls the
        // whole document back to the commit's `before` snapshot.
        schema.revertCommit(commit);
        expect(schema.cellsOf(Entity)).toHaveLength(0);
    });
});

describe("stores without draft support", () => {
    test("beginTransaction() throws a clear error", async () => {
        // The plain store minus its draft methods stands in for any store that
        // does not opt into transactions (e.g. a bare Solid store).
        const {
            createDraft: _createDraft,
            commitDraft: _commitDraft,
            revertCommit: _revertCommit,
            ...store
        } = plainStore;
        const binder = createBinder(store);
        const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });
        expect(() => schema.beginTransaction()).toThrow(/does not support transactions/);
        expect(() => schema.revertCommit({ before: schema.dump(), after: schema.dump() })).toThrow(
            /does not support reverting/,
        );
    });
});
