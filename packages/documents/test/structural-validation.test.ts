import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
// Structural validation of the underlying JSON of instance documents: checked
// when an instance is loaded and on every revalidation, so readers can trust
// the stored tables (in particular, that the row order of every table lists
// exactly its rows).
import {
    createBinder,
    createInMemoryStore,
    type Result,
    validateInstanceDocumentStructure,
} from "catcolab-documents";

function expectOk<T, E>(result: Result<T, E>): T {
    expect(result.tag).toBe("Ok");
    if (result.tag === "Err") {
        throw new Error(`Expected Ok result: ${String(result.content)}`);
    }
    return result.content;
}

function instanceDocument(tables: unknown): Document {
    return {
        type: "instance",
        name: "Data",
        version: "1",
        instanceOf: { _id: "abc", _version: null, _server: "", type: "instance-of" },
        tables,
    } as unknown as Document;
}

describe("validateInstanceDocumentStructure", () => {
    test("a well-formed instance document has no issues", () => {
        const document = instanceDocument({
            entity: { rowOrder: ["row-1"], rows: { "row-1": { fields: {} } } },
        });
        expect(validateInstanceDocumentStructure(document)).toEqual([]);
    });

    test("a malformed table is an issue", () => {
        const document = instanceDocument({ entity: { rowOrder: "not-an-array", rows: {} } });
        const issues = validateInstanceDocumentStructure(document);
        expect(issues.length).toBe(1);
        expect(issues[0]?.path).toEqual(["tables", "entity", "rowOrder"]);
    });

    test("a row listed in the row order without contents is an issue", () => {
        const document = instanceDocument({ entity: { rowOrder: ["ghost"], rows: {} } });
        const issues = validateInstanceDocumentStructure(document);
        expect(issues.length).toBe(1);
        expect(issues[0]?.message).toContain("ghost");
        expect(issues[0]?.path).toEqual(["tables", "entity", "rowOrder", 0]);
    });

    test("a row missing from the row order is an issue", () => {
        const document = instanceDocument({
            entity: { rowOrder: [], rows: { stray: { fields: {} } } },
        });
        const issues = validateInstanceDocumentStructure(document);
        expect(issues.length).toBe(1);
        expect(issues[0]?.message).toContain("stray");
        expect(issues[0]?.path).toEqual(["tables", "entity", "rows", "stray"]);
    });

    test("a row listed in the row order more than once is an issue", () => {
        const document = instanceDocument({
            entity: { rowOrder: ["row-1", "row-1"], rows: { "row-1": { fields: {} } } },
        });
        const issues = validateInstanceDocumentStructure(document);
        expect(issues.length).toBe(1);
        expect(issues[0]?.message).toContain("more than once");
        expect(issues[0]?.path).toEqual(["tables", "entity", "rowOrder", 1]);
    });

    test("a table without a row order is an issue", () => {
        const document = instanceDocument({ entity: { rows: {} } });
        const issues = validateInstanceDocumentStructure(document);
        expect(issues.length).toBe(1);
        expect(issues[0]?.path).toEqual(["tables", "entity", "rowOrder"]);
    });

    test("a non-instance document type is an issue", () => {
        const document = { type: "mystery" } as unknown as Document;
        const issues = validateInstanceDocumentStructure(document);
        expect(issues.length).toBe(1);
        expect(issues[0]?.path).toEqual(["type"]);
    });
});

// the first time tests run we incur the cost of loading the catlog-wasm bundle,
// so these tests have longer timeouts
describe("structural validation of instances", { timeout: 20_000 }, () => {
    test("loading a structurally invalid instance is an error", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        schema.add(Entity, { label: "Company" });
        const instance = expectOk(await binder.createInstance(schema, { title: "Instance" }));

        store.changeDocument(instance.handle, (document) => {
            if (document.type === "instance") {
                document.tables["entity"] = { rowOrder: [], rows: { stray: { fields: {} } } };
            }
        });

        const result = await binder.loadInstanceFromRef(
            schema,
            binder.getDocumentRef(instance.handle),
        );
        expect(result.tag).toBe("Err");
        const issues = result.tag === "Err" ? result.content : [];
        expect(issues[0]?.message).toContain("stray");
        expect(issues[0]?.path).toEqual(["tables", "entity", "rows", "stray"]);
    });

    test("a change that breaks the row order surfaces as a validation issue", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        schema.add(Entity, { label: "Company" });
        const instance = expectOk(await binder.createInstance(schema, { title: "Instance" }));

        const validation = await instance.validate();
        const table = validation.tables.find((candidate) => candidate.label === "Company");
        expect(table).toBeDefined();
        if (table === undefined) {
            return;
        }
        expectOk(await instance.addRow(table));
        expect((await instance.validate()).issues).toEqual([]);

        // Simulate a remote edit that adds a row without updating the order.
        store.changeDocument(instance.handle, (document) => {
            if (document.type === "instance") {
                const stored = document.tables[table.id];
                if (stored !== undefined) {
                    stored.rows["stray"] = { fields: {} };
                }
            }
        });

        const broken = await instance.validate();
        expect(broken.tables).toEqual([]);
        expect(broken.issues.length).toBe(1);
        expect(broken.issues[0]?.issueType).toBe("MalformedDocument");
        expect(broken.issues[0]?.message).toContain("stray");

        const read = broken.get([table.id]);
        expect(read.tag).toBe("Err");
    });
});
