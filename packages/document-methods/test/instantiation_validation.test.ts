import { binder, createBinder, type DocumentStore, Instantiation } from "catcolab-documents";
import { PetriNet, Place } from "catcolab-logics/petri-net";
import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { v7 } from "uuid";
import { describe, expect, test } from "vitest";

import type { ModelDocument } from "catcolab-document-methods";
import { DblModel } from "catlog-wasm";

// A bespoke store augmented with `getHandle`, so notebooks containing
// instantiation cells can be validated. Handles are registered by a stable id;
// the store contributes only how to fetch a handle by id (`getHandle`, whose
// document the resolver reads with `viewDocument`). The shared recursive
// elaborator (the same one the plain store uses) walks the referenced model's
// own instantiations, elaborates each against the host notebook's core theory
// (supplied by `validate`), and detects cycles, so this store reimplements none
// of that.
//
// `failOnResolve` makes `getHandle` return `undefined`, so resolution rejects
// with "unknown model" and `validate` reports `Illformed` — modelling a store
// that cannot fetch a referenced document.
function createResolvingStore(): {
    store: DocumentStore<ModelDocument>;
    failOnResolve: { value: boolean };
} {
    // Each handle gets a stable id when `createHandle` registers it, so
    // `linkForHandle` is a plain lookup and `getHandle` its inverse.
    const ids = new WeakMap<ModelDocument, string>();
    const byId = new Map<string, ModelDocument>();
    const failOnResolve = { value: false };

    const store: DocumentStore<ModelDocument> = {
        createHandle: (initialDoc) => {
            const doc = initialDoc as ModelDocument;
            const id = v7();
            ids.set(doc, id);
            byId.set(id, doc);
            return doc;
        },
        getHandle: (id) => (failOnResolve.value ? undefined : byId.get(id)),
        viewDocument: (handle) => handle,
        changeDocument: (handle, fn) => fn(handle),
        copyValue: (_handle, value) => structuredClone(value),
        linkForHandle: (handle) => {
            const id = ids.get(handle);
            return id ? { _id: id, _version: null, _server: "" } : undefined;
        },
    };

    return { store, failOnResolve };
}

describe("instantiation validation", () => {
    test("a notebook with an instantiation validates to Valid", async () => {
        const { store } = createResolvingStore();
        const resolvingBinder = createBinder(store);

        const imported = resolvingBinder.createNotebook(SimpleOlog, {
            name: "Imported",
        });
        imported.add(Type, { name: "Thing" });

        const notebook = resolvingBinder.createNotebook(SimpleOlog, {
            name: "Main",
        });
        notebook.add(Type, { name: "A" });
        notebook.add(Instantiation, {
            name: "ImportedOlog",
            model: imported,
        });

        const result = await notebook.validate();
        expect(result.issues).toBeUndefined();
        expect(result.issues === undefined && result.value).toBeInstanceOf(DblModel);
    });

    test("the plain store resolves an instantiation of a locally-validated model", async () => {
        const imported = binder.createNotebook(SimpleOlog, { name: "Imported" });
        imported.add(Type, { name: "Thing" });
        // Validating the imported notebook elaborates it; the plain store caches
        // the resulting model so the instantiation below can resolve it.
        expect((await imported.validate()).issues).toBeUndefined();

        const notebook = binder.createNotebook(SimpleOlog, { name: "Main" });
        notebook.add(Type, { name: "A" });
        notebook.add(Instantiation, { name: "ImportedOlog", model: imported });

        const result = await notebook.validate();
        expect(result.issues).toBeUndefined();
        expect(result.issues === undefined && result.value).toBeInstanceOf(DblModel);
    });

    test("a failed resolution is reported as Illformed", async () => {
        const { store, failOnResolve } = createResolvingStore();
        const resolvingBinder = createBinder(store);

        const imported = resolvingBinder.createNotebook(SimpleOlog, {
            name: "Imported",
        });
        imported.add(Type, { name: "Thing" });

        const notebook = resolvingBinder.createNotebook(SimpleOlog, {
            name: "Main",
        });
        notebook.add(Instantiation, { name: "ImportedOlog", model: imported });

        failOnResolve.value = true;
        const result = await notebook.validate();
        expect(result.issues).toBeDefined();
        expect(result.issues?.map((issue) => issue.message).join("; ")).toContain(
            "Failed to resolve",
        );
    });

    test("resolution elaborates instantiations against the host notebook's theory", async () => {
        const { store } = createResolvingStore();
        const resolvingBinder = createBinder(store);

        // A Petri-net notebook instantiating another Petri-net model: every
        // instantiation is validatable against the host's core theory
        // (`ThSymMonoidalCategory`), which `validate` threads through resolution.
        const imported = resolvingBinder.createNotebook(PetriNet, {
            name: "Imported",
        });
        imported.add(Place, { name: "S" });

        const notebook = resolvingBinder.createNotebook(PetriNet, { name: "Main" });
        notebook.add(Place, { name: "A" });
        notebook.add(Instantiation, { name: "ImportedNet", model: imported });

        const result = await notebook.validate();
        expect(result.issues).toBeUndefined();
        expect(result.issues === undefined && result.value).toBeInstanceOf(DblModel);
    });

    test("a schema can instantiate an olog because their theories are compatible", async () => {
        const { store } = createResolvingStore();
        const resolvingBinder = createBinder(store);

        // The olog's `ThCategory` embeds into the schema's `ThSchema`, so the
        // instantiated olog is validatable against the host schema's core
        // theory — the single theory `validate` threads through resolution.
        const imported = resolvingBinder.createNotebook(SimpleOlog, {
            name: "Imported",
        });
        imported.add(Type, { name: "Thing" });

        const notebook = resolvingBinder.createNotebook(SimpleSchema, {
            name: "Main",
        });
        notebook.add(Entity, { name: "A" });
        notebook.add(Instantiation, { name: "ImportedOlog", model: imported });

        const result = await notebook.validate();
        expect(result.issues).toBeUndefined();
        expect(result.issues === undefined && result.value).toBeInstanceOf(DblModel);
    });

    test("resolution recursively resolves the referenced model's own instantiations", async () => {
        const { store } = createResolvingStore();
        const resolvingBinder = createBinder(store);

        // `inner` <- `imported` <- `main`: resolving `imported` must in turn
        // resolve its instantiation of `inner`, so it elaborates against a
        // populated map rather than an empty one.
        const inner = resolvingBinder.createNotebook(SimpleOlog, { name: "Inner" });
        inner.add(Type, { name: "Thing" });

        const imported = resolvingBinder.createNotebook(SimpleOlog, {
            name: "Imported",
        });
        imported.add(Type, { name: "B" });
        imported.add(Instantiation, { name: "InnerOlog", model: inner });

        const notebook = resolvingBinder.createNotebook(SimpleOlog, {
            name: "Main",
        });
        notebook.add(Type, { name: "A" });
        notebook.add(Instantiation, { name: "ImportedOlog", model: imported });

        const result = await notebook.validate();
        expect(result.issues).toBeUndefined();
        expect(result.issues === undefined && result.value).toBeInstanceOf(DblModel);
    });

    test("a cyclic instantiation is detected and reported as Illformed", async () => {
        const { store } = createResolvingStore();
        const resolvingBinder = createBinder(store);

        // A instantiates C and C instantiates A: a cycle. The resolver tracks
        // ids whose resolution is in progress and rejects when one recurs.
        const a = resolvingBinder.createNotebook(SimpleOlog, { name: "A" });
        const c = resolvingBinder.createNotebook(SimpleOlog, { name: "C" });
        a.add(Type, { name: "TA" });
        c.add(Type, { name: "TC" });
        a.add(Instantiation, { name: "toC", model: c });
        c.add(Instantiation, { name: "toA", model: a });

        const result = await a.validate();
        expect(result.issues).toBeDefined();
        expect(result.issues?.map((issue) => issue.message).join("; ")).toContain(
            "Cyclic instantiation",
        );
    });
});
