import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
// The per-handle document cache: structural validation of the underlying JSON
// document, recomputed on every change, plus cached derived data.
import {
    createBinder,
    createInMemoryStore,
    documentCacheFor,
    modelNotebookFromStore,
    validateDocumentStructure,
} from "catcolab-documents";

function emptyModelDocument(): Document {
    return {
        type: "model",
        name: "An Olog",
        theory: "simple-olog",
        version: "1",
        notebook: { cellContents: {}, cellOrder: [] },
    };
}

describe("validateDocumentStructure", () => {
    test("a well-formed model document has no issues", () => {
        expect(validateDocumentStructure(emptyModelDocument())).toEqual([]);
    });

    test("a cell listed in the order without contents is an issue", () => {
        const document = emptyModelDocument();
        if (document.type === "model") {
            document.notebook.cellOrder.push("ghost");
        }
        const issues = validateDocumentStructure(document);
        expect(issues.length).toBe(1);
        expect(issues[0]?.message).toContain("ghost");
        expect(issues[0]?.path).toEqual(["notebook", "cellOrder", 0]);
    });

    test("a formal cell without a judgment id is an issue", () => {
        const document = emptyModelDocument();
        if (document.type === "model") {
            document.notebook.cellOrder.push("cell-1");
            document.notebook.cellContents["cell-1"] = {
                tag: "formal",
                id: "cell-1",
                // @ts-expect-error deliberately malformed judgment
                content: { tag: "object", name: "A" },
            };
        }
        const issues = validateDocumentStructure(document);
        expect(issues.map((issue) => issue.message)).toEqual(["A model judgment must have an id"]);
    });

    test("a malformed instance table is an issue", () => {
        const document = {
            type: "instance",
            name: "Data",
            version: "1",
            instanceOf: { _id: "abc", _version: null, _server: "", type: "instance-of" },
            tables: { entity: { rowOrder: "not-an-array", rows: {} } },
        } as unknown as Document;
        const issues = validateDocumentStructure(document);
        expect(issues.length).toBe(1);
        expect(issues[0]?.path).toEqual(["tables", "entity", "rowOrder"]);
    });

    test("a row listed in the row order without contents is an issue", () => {
        const document = {
            type: "instance",
            name: "Data",
            version: "1",
            instanceOf: { _id: "abc", _version: null, _server: "", type: "instance-of" },
            tables: { entity: { rowOrder: ["ghost"], rows: {} } },
        } as unknown as Document;
        const issues = validateDocumentStructure(document);
        expect(issues.length).toBe(1);
        expect(issues[0]?.message).toContain("ghost");
        expect(issues[0]?.path).toEqual(["tables", "entity", "rowOrder", 0]);
    });

    test("a row missing from the row order is an issue", () => {
        const document = {
            type: "instance",
            name: "Data",
            version: "1",
            instanceOf: { _id: "abc", _version: null, _server: "", type: "instance-of" },
            tables: { entity: { rowOrder: [], rows: { stray: { fields: {} } } } },
        } as unknown as Document;
        const issues = validateDocumentStructure(document);
        expect(issues.length).toBe(1);
        expect(issues[0]?.message).toContain("stray");
        expect(issues[0]?.path).toEqual(["tables", "entity", "rows", "stray"]);
    });

    test("a table without a row order is an issue", () => {
        const document = {
            type: "instance",
            name: "Data",
            version: "1",
            instanceOf: { _id: "abc", _version: null, _server: "", type: "instance-of" },
            tables: { entity: { rows: {} } },
        } as unknown as Document;
        const issues = validateDocumentStructure(document);
        expect(issues.length).toBe(1);
        expect(issues[0]?.path).toEqual(["tables", "entity", "rowOrder"]);
    });

    test("an unknown document type is an issue", () => {
        const document = { type: "mystery" } as unknown as Document;
        const issues = validateDocumentStructure(document);
        expect(issues.length).toBe(1);
        expect(issues[0]?.path).toEqual(["type"]);
    });
});

describe("documentCacheFor", () => {
    test("one cache is shared per handle", async () => {
        const store = createInMemoryStore();
        const handle = await store.createHandle(emptyModelDocument());

        const cache = documentCacheFor(store, handle);
        expect(documentCacheFor(store, handle)).toBe(cache);
    });

    test("snapshots are unproxied, shared, and refreshed on change", async () => {
        const store = createInMemoryStore();
        const handle = await store.createHandle(emptyModelDocument());
        const cache = documentCacheFor(store, handle);

        const first = cache.snapshot();
        expect(cache.snapshot()).toBe(first);
        expect(first).not.toBe(store.getDocumentView(handle));

        const generation = cache.generation();
        store.changeDocument(handle, (document) => {
            document.name = "Renamed";
        });
        expect(cache.generation()).toBe(generation + 1);
        const second = cache.snapshot();
        expect(second).not.toBe(first);
        expect(second.name).toBe("Renamed");
    });

    test("structural issues are revalidated on every change", async () => {
        const store = createInMemoryStore();
        const handle = await store.createHandle(emptyModelDocument());
        const cache = documentCacheFor(store, handle);

        expect(cache.structuralIssues()).toEqual([]);

        store.changeDocument(handle, (document) => {
            if (document.type === "model") {
                document.notebook.cellOrder.push("ghost");
            }
        });
        expect(cache.structuralIssues().length).toBe(1);

        store.changeDocument(handle, (document) => {
            if (document.type === "model") {
                document.notebook.cellOrder.pop();
            }
        });
        expect(cache.structuralIssues()).toEqual([]);
    });
});

// the first time tests run we incur the cost of loading the catlog-wasm bundle,
// so these tests have longer timeouts
describe("cached validation", { timeout: 20000 }, () => {
    test("repeated validation of an unchanged notebook returns the same result", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });
        const a = notebook.add(Type, { label: "A" });
        const b = notebook.add(Type, { label: "B" });
        notebook.add(Aspect, { label: "has", from: a, to: b });

        const first = await notebook.validate();
        const second = await notebook.validate();
        expect(second).toBe(first);

        notebook.add(Type, { label: "C" });
        const third = await notebook.validate();
        expect(third).not.toBe(first);
        expect(third.model.judgmentsOf(Type).length).toBe(3);
    });

    test("a structurally invalid document reports issues without elaborating", async () => {
        const store = createInMemoryStore();
        const handle = await store.createHandle(emptyModelDocument());
        const notebook = modelNotebookFromStore(SimpleOlog, store, handle);
        notebook.add(Type, { label: "A" });

        store.changeDocument(handle, (document) => {
            if (document.type === "model") {
                document.notebook.cellOrder.push("ghost");
            }
        });

        const result = await notebook.validate();
        expect(result.issues.length).toBe(1);
        expect(result.issues[0]?.message).toContain("ghost");
        expect(result.model.judgments()).toEqual([]);
    });

    test("loading a structurally invalid dump is an error", async () => {
        const binder = createBinder();
        const malformed = emptyModelDocument();
        if (malformed.type === "model") {
            malformed.notebook.cellOrder.push("ghost");
        }

        const result = await binder.loadSupportedDocument([SimpleOlog], malformed);
        expect(result.tag).toBe("Err");
        const issues = result.tag === "Err" ? result.content : [];
        expect(issues[0]?.message).toContain("ghost");
    });
});
