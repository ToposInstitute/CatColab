/**
 * Tests for the per-store elaboration cache behind `resolveModelInStore`
 * (`src/model-cache.ts`). Elaborations are counted by spying on
 * `elaborateModel` from `catlog-wasm`: the cache's whole point is to avoid
 * re-running it, so the spy's call count *is* the observable behavior.
 */
import { Visualization } from "catcolab-analyses";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { v7 } from "uuid";
import { describe, expect, test, vi } from "vitest";

import type { Document } from "catcolab-document-types";
import {
    CellKind,
    createBinder,
    type DocumentStore,
    Instantiation,
    RichText,
} from "catcolab-documents";
import { formalCellsSignature } from "../src/model-cache";

test("formal content signatures support LLM conversations", () => {
    const conversation: Document = {
        type: "llmconversation",
        name: "Conversation",
        llmConversationOf: {
            type: "llmconversation-of",
            _id: v7(),
            _version: null,
            _server: "",
        },
        llmModel: "test-model",
        interactions: [],
        version: "2",
    };
    const emptySignature = formalCellsSignature(conversation);

    conversation.interactions.push({
        tag: "user-message",
        timestamp: "2026-08-04T00:00:00.000Z",
        id: v7(),
        content: "Hello",
        files: [],
    });

    expect(formalCellsSignature(conversation)).not.toBe(emptySignature);
});

vi.mock("catlog-wasm", async (importOriginal) => {
    const original = await importOriginal<typeof import("catlog-wasm")>();
    return {
        ...original,
        elaborateModel: vi.fn<typeof original.elaborateModel>(original.elaborateModel),
    };
});

/** The spied `elaborateModel`, for counting calls per document id (its fourth
 * argument). */
const elaborations = async () => {
    const { elaborateModel } = await import("catlog-wasm");
    return elaborateModel as unknown as ReturnType<typeof vi.fn>;
};

/** Calls of the spied `elaborateModel` for a given document id. */
const elaborationsOf = async (id: string): Promise<number> => {
    const spy = await elaborations();
    return spy.mock.calls.filter((call) => call[3] === id).length;
};

/** The reference id a store minted for a notebook's handle. */
const idOf = (store: DocumentStore<Document>, notebook: { handle: Document }): string => {
    const ref = store.getDocumentRef(notebook.handle);
    if (!ref) {
        throw new Error("store minted no reference");
    }
    return ref.id;
};

// A bespoke resolving store, as in `instantiation_validation.test.ts`. Each
// test creates its own store object, so each gets its own cache (the cache
// registry is keyed by store identity).
function createResolvingStore(): {
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

describe("model cache", () => {
    test("repeated validate() reuses one elaboration and one model", async () => {
        const { store } = createResolvingStore();
        const binder = createBinder(store);

        const notebook = await binder.createNotebook(SimpleOlog, { title: "Main" });
        notebook.add(Type, { label: "A" });
        const id = idOf(store, notebook);

        const first = await notebook.validate();
        const second = await notebook.validate();
        expect(first.tag).toBe("Ok");
        expect(second.tag).toBe("Ok");
        // Same cached model object, elaborated exactly once.
        expect(first.tag === "Ok" && second.tag === "Ok" && first.content).toBe(
            second.tag === "Ok" && second.content,
        );
        expect(await elaborationsOf(id)).toBe(1);
    });

    test("a formal edit re-elaborates; the models differ", async () => {
        const { store } = createResolvingStore();
        const binder = createBinder(store);

        const notebook = await binder.createNotebook(SimpleOlog, { title: "Main" });
        notebook.add(Type, { label: "A" });
        const id = idOf(store, notebook);

        const first = await notebook.validate();
        notebook.add(Type, { label: "B" });
        const second = await notebook.validate();

        expect(await elaborationsOf(id)).toBe(2);
        expect(first.tag === "Ok" && second.tag === "Ok" && first.content).not.toBe(
            second.tag === "Ok" && second.content,
        );
    });

    test("non-formal changes (rich text, rename) keep the cached model", async () => {
        const { store } = createResolvingStore();
        const binder = createBinder(store);

        const notebook = await binder.createNotebook(SimpleOlog, { title: "Main" });
        notebook.add(Type, { label: "A" });
        const id = idOf(store, notebook);

        await notebook.validate();
        // Both changes bump the document's version but not its formal content.
        notebook.add(RichText, { content: "A comment." });
        notebook.update({ title: "Renamed" });
        const again = await notebook.validate();

        expect(again.tag).toBe("Ok");
        expect(await elaborationsOf(id)).toBe(1);
    });

    test("instantiation resolution shares cached models across top-level calls", async () => {
        const { store } = createResolvingStore();
        const binder = createBinder(store);

        const inner = await binder.createNotebook(SimpleOlog, { title: "Inner" });
        inner.add(Type, { label: "Thing" });

        const importedA = await binder.createNotebook(SimpleOlog, { title: "A" });
        importedA.add(Instantiation, { label: "InnerA", model: inner });
        const importedB = await binder.createNotebook(SimpleOlog, { title: "B" });
        importedB.add(Instantiation, { label: "InnerB", model: inner });

        const main = await binder.createNotebook(SimpleOlog, { title: "Main" });
        main.add(Instantiation, { label: "ImportA", model: importedA });
        main.add(Instantiation, { label: "ImportB", model: importedB });

        // Validate every notebook separately: a diamond of instantiations, four
        // top-level calls — yet each document elaborates exactly once.
        expect((await inner.validate()).tag).toBe("Ok");
        expect((await importedA.validate()).tag).toBe("Ok");
        expect((await importedB.validate()).tag).toBe("Ok");
        expect((await main.validate()).tag).toBe("Ok");

        for (const notebook of [inner, importedA, importedB, main]) {
            expect(await elaborationsOf(idOf(store, notebook))).toBe(1);
        }
    });

    test("a grandchild edit invalidates the root; untouched siblings are reused", async () => {
        const { store } = createResolvingStore();
        const binder = createBinder(store);

        const inner = await binder.createNotebook(SimpleOlog, { title: "Inner" });
        inner.add(Type, { label: "Thing" });
        const imported = await binder.createNotebook(SimpleOlog, { title: "Imported" });
        imported.add(Instantiation, { label: "Inner", model: inner });
        const sibling = await binder.createNotebook(SimpleOlog, { title: "Sibling" });
        sibling.add(Type, { label: "S" });

        const main = await binder.createNotebook(SimpleOlog, { title: "Main" });
        main.add(Instantiation, { label: "Import", model: imported });
        main.add(Instantiation, { label: "Sib", model: sibling });

        expect((await main.validate()).tag).toBe("Ok");

        // Edit the *grandchild*: `imported` is untouched, but its model embeds
        // `inner`'s content, so both it and `main` must re-elaborate. The
        // sibling is unaffected and must be reused.
        inner.add(Type, { label: "Another" });
        expect((await main.validate()).tag).toBe("Ok");

        expect(await elaborationsOf(idOf(store, inner))).toBe(2);
        expect(await elaborationsOf(idOf(store, imported))).toBe(2);
        expect(await elaborationsOf(idOf(store, main))).toBe(2);
        expect(await elaborationsOf(idOf(store, sibling))).toBe(1);
    });

    test("analysis cells share one elaboration, including concurrent runs", async () => {
        const { store } = createResolvingStore();
        const binder = createBinder(store);

        const model = await binder.createNotebook(SimpleOlog, { title: "Model" });
        model.add(Type, { label: "A" });
        const id = idOf(store, model);

        const analysis = await binder.createNotebook(SimpleOlog.Analysis, {
            title: "Analysis",
            of: model,
        });
        const first = analysis.add(Visualization);
        const second = analysis.add(Visualization);

        // Concurrent runs (as when all cells of a notebook run on mount)
        // dedupe on the in-flight entry; the sequential re-run hits the cache.
        const [a, b] = await Promise.all([first.run(), second.run()]);
        expect(a.tag).toBe("Ok");
        expect(b.tag).toBe("Ok");
        expect((await first.run()).tag).toBe("Ok");
        expect(await elaborationsOf(id)).toBe(1);

        // An edit to the analyzed model is picked up by the next run.
        model.add(Type, { label: "B" });
        const after = await first.run();
        expect(after.tag).toBe("Ok");
        expect(after.tag === "Ok" && after.content.svg.includes(">B<")).toBe(true);
        expect(await elaborationsOf(id)).toBe(2);
    });

    test("a cycle introduced by an edit after a cached validate is detected", async () => {
        const { store } = createResolvingStore();
        const binder = createBinder(store);

        const a = await binder.createNotebook(SimpleOlog, { title: "A" });
        const c = await binder.createNotebook(SimpleOlog, { title: "C" });
        a.add(Type, { label: "TA" });
        c.add(Type, { label: "TC" });
        a.add(Instantiation, { label: "toC", model: c });

        expect((await a.validate()).tag).toBe("Ok");

        c.add(Instantiation, { label: "toA", model: a });
        const result = await a.validate();
        expect(result.tag).toBe("Err");
        expect(
            result.tag === "Err" && result.content.map((issue) => issue.message).join("; "),
        ).toContain("Instantiation cycle detected");

        // Breaking the cycle recovers: failures were never cached.
        for (const cell of c.cells()) {
            if (cell.kind === CellKind.Instantiation) {
                cell.delete();
            }
        }
        expect((await a.validate()).tag).toBe("Ok");
    });

    test("a failed resolution is not cached; a later resolution succeeds", async () => {
        const { store, failOnResolve } = createResolvingStore();
        const binder = createBinder(store);

        const imported = await binder.createNotebook(SimpleOlog, { title: "Imported" });
        imported.add(Type, { label: "Thing" });
        const notebook = await binder.createNotebook(SimpleOlog, { title: "Main" });
        notebook.add(Instantiation, { label: "Import", model: imported });

        failOnResolve.value = true;
        const failed = await notebook.validate();
        expect(failed.tag).toBe("Err");

        failOnResolve.value = false;
        const recovered = await notebook.validate();
        expect(recovered.tag).toBe("Ok");
    });
});
