import { binder, createBinder, type DocumentStore, Instantiation } from "catcolab-documents";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { v7 } from "uuid";
import { describe, expect, test } from "vitest";

import type { ModelDocument } from "catcolab-document-methods";
import type { Link } from "catcolab-document-types";
import { DblModel, DblModelMap, elaborateModel, type ModelNotebook, ThCategory } from "catlog-wasm";

// A plain store augmented with `resolveModel`, so notebooks containing
// instantiation cells can be validated. Documents are registered by a stable
// id; `resolveModel` elaborates the referenced document against the olog core
// theory (the referenced models here have no instantiations of their own, so an
// empty inner map suffices).
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
        resolveModel: async (link: Link) => {
            if (failOnResolve.value) {
                throw new Error("resolver unavailable");
            }
            const doc = byId.get(link._id);
            if (!doc) {
                throw new Error(`unknown model ${link._id}`);
            }
            return elaborateModel(
                doc.notebook as unknown as ModelNotebook,
                new DblModelMap(),
                new ThCategory().theory(),
                link._id,
            );
        },
    };

    return { store, failOnResolve };
}

describe("instantiation validation", () => {
    test("a notebook with an instantiation validates to Valid", async () => {
        const { store } = createResolvingStore();
        const resolvingBinder = createBinder(store);

        const imported = resolvingBinder.createNotebook(SimpleOlog, { name: "Imported" });
        imported.add(Type, { name: "Thing" });

        const notebook = resolvingBinder.createNotebook(SimpleOlog, { name: "Main" });
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

        const imported = resolvingBinder.createNotebook(SimpleOlog, { name: "Imported" });
        imported.add(Type, { name: "Thing" });

        const notebook = resolvingBinder.createNotebook(SimpleOlog, { name: "Main" });
        notebook.add(Instantiation, { name: "ImportedOlog", model: imported });

        failOnResolve.value = true;
        const result = await notebook.validate();
        expect(result.tag).toBe("Illformed");
        expect(result.tag === "Illformed" && result.error).toContain("Failed to resolve");
    });
});
