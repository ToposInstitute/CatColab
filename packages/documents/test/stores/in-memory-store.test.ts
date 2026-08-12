import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

import { Model } from "catcolab-document-methods";
// RFC-0006 "Use with SolidJS and Automerge" — the default, in-memory store.
import { createBinder, createInMemoryStore, type Issue, type Result } from "catcolab-documents";
import { assertNotebookStructureIsConsistent } from "../helpers/notebook_invariants";

function newDocument(name: string) {
    const document = Model.newModelDocument({ theory: "simple-olog" });
    document.name = name;
    return document;
}

/** The issues of an `Err` result, or a thrown error if it is `Ok`. */
function errIssues(result: Result<unknown>): ReadonlyArray<Issue> {
    if (result.tag !== "Err") {
        throw new Error("Expected an Err result.");
    }
    return result.content;
}

describe("the in-memory document store", () => {
    test("a notebook reads and writes through the store", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        expect(notebook.title).toBe("An Olog");

        const a = notebook.add(Type, { label: "A" });
        const b = notebook.add(Type, { label: "B" });
        const has = notebook.add(Aspect, { label: "has", from: a, to: b });

        expect(has.from?.label).toBe("A");
        expect(has.to?.label).toBe("B");

        a.update({ label: "A2" });
        expect(has.from?.label).toBe("A2");

        notebook.update({ title: "Another Olog" });
        expect(notebook.title).toBe("Another Olog");

        assertNotebookStructureIsConsistent(notebook);
    });

    test("notebooks in one binder have independent subscribers", async () => {
        const binder = createBinder();
        const first = await binder.createNotebook(SimpleOlog, { title: "First" });
        const second = await binder.createNotebook(SimpleOlog, { title: "Second" });

        let firstChanges = 0;
        first.onChange(() => {
            firstChanges += 1;
        });

        second.add(Type, { label: "A" });
        expect(firstChanges).toBe(0);
        expect(second.title).toBe("Second");

        first.add(Type, { label: "A" });
        expect(firstChanges).toBeGreaterThan(0);
    });

    test("dump returns a detached copy of the document", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });
        notebook.add(Type, { label: "A" });

        const dumped = notebook.dump();
        expect(dumped).not.toBe(notebook.document);
        expect(dumped).toEqual(notebook.document);

        notebook.update({ title: "Another Olog" });
        expect(dumped.name).toBe("An Olog");
        expect(notebook.title).toBe("Another Olog");
    });

    test("changeDocument notifies subscribers until they unsubscribe", async () => {
        const store = createInMemoryStore();
        const handle = await store.createHandle(newDocument("An Olog"));

        const calls: unknown[][] = [];
        const unsubscribe = store.subscribe(handle, (...args: unknown[]) => {
            calls.push(args);
        });

        store.changeDocument(handle, (doc) => {
            doc.name = "First";
        });
        expect(calls).toEqual([[]]);

        store.changeDocument(handle, (doc) => {
            doc.name = "Second";
        });
        expect(calls.length).toBe(2);

        unsubscribe();
        store.changeDocument(handle, (doc) => {
            doc.name = "Third";
        });
        expect(calls.length).toBe(2);
        expect(store.getDocumentView(handle).name).toBe("Third");
    });

    test("a handle can be recovered from its own document ref", async () => {
        const store = createInMemoryStore();
        const handle = await store.createHandle(newDocument("An Olog"));

        const ref = store.getDocumentRef(handle);
        expect(ref.version).toBeNull();

        const resolved = await store.getHandle(ref);
        expect(resolved.tag).toBe("Ok");
        if (resolved.tag !== "Ok") {
            return;
        }
        expect(store.getDocumentView(resolved.content).name).toBe("An Olog");
    });

    test("distinct handles get distinct refs", async () => {
        const store = createInMemoryStore();
        const first = await store.createHandle(newDocument("First"));
        const second = await store.createHandle(newDocument("Second"));

        expect(store.getDocumentRef(first).id).not.toBe(store.getDocumentRef(second).id);
    });

    test("getHandle rejects refs the in-memory store cannot resolve", async () => {
        const store = createInMemoryStore();

        expect(
            errIssues(await store.getHandle({ id: "no-such-document", version: null })).length,
        ).toBeGreaterThan(0);

        expect(
            errIssues(await store.getHandle({ id: "some-document", version: "v1" })).length,
        ).toBeGreaterThan(0);

        expect(
            errIssues(
                await store.getHandle({
                    id: "some-document",
                    version: null,
                    server: "catcolab.org",
                }),
            ).length,
        ).toBeGreaterThan(0);
    });

    test("handles from another store are rejected", async () => {
        const store = createInMemoryStore();
        const other = createInMemoryStore();
        const handle = await other.createHandle(newDocument("An Olog"));

        expect(() => store.getDocumentView(handle)).toThrow();
        expect(() => store.getDocumentRef(handle)).toThrow();
        expect(() => store.changeDocument(handle, () => {})).toThrow();
    });
});
