import { PetriNet, Place } from "catcolab-logics/petri-net";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { v7 } from "uuid";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
import { createBinder, type DocumentStore, Instantiation } from "catcolab-documents";
import { DblModel } from "catlog-wasm";

const binder = createBinder();

// A bespoke store augmented with `getHandle`, so notebooks containing
// instantiation cells can be validated. Handles are registered by a stable id;
// the store contributes only how to fetch a handle by link (`getHandle`, whose
// document the resolver reads with `getDocumentView`). The shared recursive
// elaborator (the same one the plain store uses) walks the referenced model's
// own instantiations, elaborates each against the host notebook's core theory
// (supplied by `validate`), and detects cycles, so this store reimplements none
// of that.
//
// `failOnResolve` makes `getHandle` return `undefined`, so resolution rejects
// with "unknown model" and `validate` reports `Illformed` — modelling a store
// that cannot fetch a referenced document.
function createResolvingStore(): {
    store: DocumentStore<Document>;
    failOnResolve: { value: boolean };
} {
    // Each handle gets a stable id when `createHandle` registers it, so
    // `getDocumentRef` is a plain lookup and `getHandle` its inverse.
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

describe("instantiation validation", () => {
    test("a notebook with an instantiation validates to Valid", async () => {
        const { store } = createResolvingStore();
        const resolvingBinder = createBinder(store);

        const imported = await resolvingBinder.createNotebook(SimpleOlog, {
            title: "Imported",
        });
        imported.add(Type, { label: "Thing" });

        const notebook = await resolvingBinder.createNotebook(SimpleOlog, {
            title: "Main",
        });
        notebook.add(Type, { label: "A" });
        notebook.add(Instantiation, {
            label: "ImportedOlog",
            model: imported,
        });

        const result = await notebook.validate();
        expect(result.tag).toBe("Ok");
        expect(result.tag === "Ok" && result.content).toBeInstanceOf(DblModel);
    });

    test("the plain store resolves an instantiation of a locally-validated model", async () => {
        const imported = await binder.createNotebook(SimpleOlog, { title: "Imported" });
        imported.add(Type, { label: "Thing" });
        // Validating the imported notebook elaborates it; the plain store caches
        // the resulting model so the instantiation below can resolve it.
        expect((await imported.validate()).tag).toBe("Ok");

        const notebook = await binder.createNotebook(SimpleOlog, { title: "Main" });
        notebook.add(Type, { label: "A" });
        notebook.add(Instantiation, { label: "ImportedOlog", model: imported });

        const result = await notebook.validate();
        expect(result.tag).toBe("Ok");
        expect(result.tag === "Ok" && result.content).toBeInstanceOf(DblModel);
    });

    test("a failed resolution is reported as Illformed", async () => {
        const { store, failOnResolve } = createResolvingStore();
        const resolvingBinder = createBinder(store);

        const imported = await resolvingBinder.createNotebook(SimpleOlog, {
            title: "Imported",
        });
        imported.add(Type, { label: "Thing" });

        const notebook = await resolvingBinder.createNotebook(SimpleOlog, {
            title: "Main",
        });
        notebook.add(Instantiation, { label: "ImportedOlog", model: imported });

        failOnResolve.value = true;
        const result = await notebook.validate();
        expect(result.tag).toBe("Err");
        expect(
            result.tag === "Err" && result.content.map((issue) => issue.message).join("; "),
        ).toContain("unknown model");
    });

    test("resolution elaborates instantiations against the host notebook's theory", async () => {
        const { store } = createResolvingStore();
        const resolvingBinder = createBinder(store);

        // A Petri-net notebook instantiating another Petri-net model: every
        // instantiation is validatable against the host's core theory
        // (`ThSymMonoidalCategory`), which `validate` threads through resolution.
        const imported = await resolvingBinder.createNotebook(PetriNet, {
            title: "Imported",
        });
        imported.add(Place, { label: "S" });

        const notebook = await resolvingBinder.createNotebook(PetriNet, { title: "Main" });
        notebook.add(Place, { label: "A" });
        notebook.add(Instantiation, { label: "ImportedNet", model: imported });

        const result = await notebook.validate();
        expect(result.tag).toBe("Ok");
        expect(result.tag === "Ok" && result.content).toBeInstanceOf(DblModel);
    });

    test("a schema can instantiate an olog because their theories are compatible", async () => {
        const { store } = createResolvingStore();
        const resolvingBinder = createBinder(store);

        // The olog's `ThCategory` embeds into the schema's `ThSchema`, so the
        // instantiated olog is validatable against the host schema's core
        // theory — the single theory `validate` threads through resolution.
        const imported = await resolvingBinder.createNotebook(SimpleOlog, {
            title: "Imported",
        });
        imported.add(Type, { label: "Thing" });

        const notebook = await resolvingBinder.createNotebook(SimpleSchema, {
            title: "Main",
        });
        notebook.add(Entity, { label: "A" });
        notebook.add(Instantiation, { label: "ImportedOlog", model: imported });

        const result = await notebook.validate();
        expect(result.tag).toBe("Ok");
        expect(result.tag === "Ok" && result.content).toBeInstanceOf(DblModel);
    });

    test("resolution recursively resolves the referenced model's own instantiations", async () => {
        const { store } = createResolvingStore();
        const resolvingBinder = createBinder(store);

        // `inner` <- `imported` <- `main`: resolving `imported` must in turn
        // resolve its instantiation of `inner`, so it elaborates against a
        // populated map rather than an empty one.
        const inner = await resolvingBinder.createNotebook(SimpleOlog, { title: "Inner" });
        inner.add(Type, { label: "Thing" });

        const imported = await resolvingBinder.createNotebook(SimpleOlog, {
            title: "Imported",
        });
        imported.add(Type, { label: "B" });
        imported.add(Instantiation, { label: "InnerOlog", model: inner });

        const notebook = await resolvingBinder.createNotebook(SimpleOlog, {
            title: "Main",
        });
        notebook.add(Type, { label: "A" });
        notebook.add(Instantiation, { label: "ImportedOlog", model: imported });

        const result = await notebook.validate();
        expect(result.tag).toBe("Ok");
        expect(result.tag === "Ok" && result.content).toBeInstanceOf(DblModel);
    });

    test("a cyclic instantiation is detected and reported as Illformed", async () => {
        const { store } = createResolvingStore();
        const resolvingBinder = createBinder(store);

        // A instantiates C and C instantiates A: a cycle. The resolver tracks
        // ids whose resolution is in progress and rejects when one recurs.
        const a = await resolvingBinder.createNotebook(SimpleOlog, { title: "A" });
        const c = await resolvingBinder.createNotebook(SimpleOlog, { title: "C" });
        a.add(Type, { label: "TA" });
        c.add(Type, { label: "TC" });
        a.add(Instantiation, { label: "toC", model: c });
        c.add(Instantiation, { label: "toA", model: a });

        const result = await a.validate();
        expect(result.tag).toBe("Err");
        expect(
            result.tag === "Err" && result.content.map((issue) => issue.message).join("; "),
        ).toContain("Instantiation cycle detected");
    });
});
