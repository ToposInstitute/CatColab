import {
    binder,
    createBinder,
    type DocumentStore,
    Instantiation,
    resolveModelWith,
} from "catcolab-documents";
import { PetriNet, Place } from "catcolab-logics/petri-net";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { v7 } from "uuid";
import { describe, expect, test } from "vitest";

import type { ModelDocument } from "catcolab-document-methods";
import type { Link } from "catcolab-document-types";
import { DblModel } from "catlog-wasm";

// The shapes whose documents this store can resolve, looked up by the
// document's `theory` id so a referenced model is validated against its own
// shape (and thus its own core theory): a Petri-net model resolves against
// `ThSymMonoidalCategory` while an olog resolves against `ThCategory`.
const resolvableShapes = [SimpleOlog, PetriNet];

const shapeFor = (theory: string) => resolvableShapes.find((shape) => shape.theory === theory);

// A bespoke store augmented with `resolveModel`, so notebooks containing
// instantiation cells can be validated. Documents are registered by a stable
// id; `resolveModel` defers to the shared `resolveModelWith` recursive
// elaborator (the same one the plain store uses), supplying only how to fetch a
// document by id and how to find a document theory's core theory (via
// `shapeFor`). The shared helper walks the referenced model's own
// instantiations, elaborates against the looked-up core theory, and detects
// cycles, so this store reimplements none of that.
function createResolvingStore(): {
    store: DocumentStore<ModelDocument>;
    failOnResolve: { value: boolean };
} {
    const ids = new WeakMap<ModelDocument, string>();
    const byId = new Map<string, ModelDocument>();
    const failOnResolve = { value: false };

    const idFor = (doc: ModelDocument): string => {
        let id = ids.get(doc);
        if (!id) {
            id = v7();
            ids.set(doc, id);
            byId.set(id, doc);
        }
        return id;
    };

    const resolveModel = (link: Link): Promise<DblModel> => {
        if (failOnResolve.value) {
            return Promise.reject(new Error("resolver unavailable"));
        }
        return resolveModelWith(
            {
                getDocument: (id) => byId.get(id),
                coreTheoryFor: (theory) => shapeFor(theory)?.coreTheory,
            },
            link,
        );
    };

    const store: DocumentStore<ModelDocument> = {
        createHandle: (initialDoc) => {
            const doc = initialDoc as ModelDocument;
            idFor(doc);
            return doc;
        },
        viewDocument: (handle) => handle,
        changeDocument: (handle, fn) => fn(handle),
        copyValue: (_handle, value) => structuredClone(value),
        linkForHandle: (handle) => ({
            _id: idFor(handle),
            _version: null,
            _server: "",
        }),
        resolveModel,
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
        expect(result.tag).toBe("Valid");
        expect(result.model).toBeInstanceOf(DblModel);
    });

    test("the plain store resolves an instantiation of a locally-validated model", async () => {
        const imported = binder.createNotebook(SimpleOlog, { name: "Imported" });
        imported.add(Type, { name: "Thing" });
        // Validating the imported notebook elaborates it; the plain store caches
        // the resulting model so the instantiation below can resolve it.
        expect((await imported.validate()).tag).toBe("Valid");

        const notebook = binder.createNotebook(SimpleOlog, { name: "Main" });
        notebook.add(Type, { name: "A" });
        notebook.add(Instantiation, { name: "ImportedOlog", model: imported });

        const result = await notebook.validate();
        expect(result.tag).toBe("Valid");
        expect(result.model).toBeInstanceOf(DblModel);
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
        expect(result.tag).toBe("Illformed");
        expect(result.tag === "Illformed" && result.error).toContain("Failed to resolve");
    });

    test("resolveModel elaborates the referenced document against its own theory", async () => {
        const { store } = createResolvingStore();
        const resolvingBinder = createBinder(store);

        // A Petri-net model elaborates against `ThSymMonoidalCategory`, so the
        // resolver must look its theory up by the document's `theory` id rather
        // than assuming an olog's `ThCategory`.
        const imported = resolvingBinder.createNotebook(PetriNet, {
            name: "Imported",
        });
        imported.add(Place, { name: "S" });

        const notebook = resolvingBinder.createNotebook(PetriNet, { name: "Main" });
        notebook.add(Place, { name: "A" });
        notebook.add(Instantiation, { name: "ImportedNet", model: imported });

        const result = await notebook.validate();
        expect(result.tag).toBe("Valid");
        expect(result.model).toBeInstanceOf(DblModel);
    });

    test("resolveModel recursively resolves the referenced model's own instantiations", async () => {
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
        expect(result.tag).toBe("Valid");
        expect(result.model).toBeInstanceOf(DblModel);
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
        expect(result.tag).toBe("Illformed");
        expect(result.tag === "Illformed" && result.error).toContain("Cyclic instantiation");
    });
});
