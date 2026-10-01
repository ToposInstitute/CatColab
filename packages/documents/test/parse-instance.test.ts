import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
// Parsing of the underlying JSON of instance documents: the untrusted stored
// tables are parsed into a repaired structure whose row orders list exactly
// the rows of each table, and every repair is reported as an issue alongside
// the parsed value. Readers consume only the parsed structure.
import {
    createBinder,
    createInMemoryStore,
    parseInstanceDocument,
    type Result,
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

describe("parseInstanceDocument", () => {
    test("a well-formed instance document parses without issues", () => {
        const document = instanceDocument({
            entity: { rowOrder: ["row-1"], rows: { "row-1": { fields: {} } } },
        });
        const parsed = expectOk(parseInstanceDocument(document));
        expect(parsed.issues).toEqual([]);
        expect(parsed.value.name).toBe("Data");
        expect(parsed.value.tables["entity"]?.rowOrder).toEqual(["row-1"]);
    });

    test("a malformed row order is repaired to the rows' key order", () => {
        const document = instanceDocument({
            entity: { rowOrder: "not-an-array", rows: { "row-1": { fields: {} } } },
        });
        const parsed = expectOk(parseInstanceDocument(document));
        expect(parsed.issues.length).toBe(1);
        expect(parsed.issues[0]?.path).toEqual(["tables", "entity", "rowOrder"]);
        expect(parsed.value.tables["entity"]?.rowOrder).toEqual(["row-1"]);
    });

    test("a malformed table is dropped", () => {
        const document = instanceDocument({ entity: "not-a-table" });
        const parsed = expectOk(parseInstanceDocument(document));
        expect(parsed.issues.length).toBe(1);
        expect(parsed.issues[0]?.path).toEqual(["tables", "entity"]);
        expect(parsed.value.tables["entity"]).toBeUndefined();
    });

    test("a row listed in the row order without contents is dropped from the order", () => {
        const document = instanceDocument({ entity: { rowOrder: ["ghost"], rows: {} } });
        const parsed = expectOk(parseInstanceDocument(document));
        expect(parsed.issues.length).toBe(1);
        expect(parsed.issues[0]?.message).toContain("ghost");
        expect(parsed.issues[0]?.path).toEqual(["tables", "entity", "rowOrder", 0]);
        expect(parsed.value.tables["entity"]?.rowOrder).toEqual([]);
    });

    test("a row missing from the row order is appended to it", () => {
        const document = instanceDocument({
            entity: { rowOrder: [], rows: { stray: { fields: {} } } },
        });
        const parsed = expectOk(parseInstanceDocument(document));
        expect(parsed.issues.length).toBe(1);
        expect(parsed.issues[0]?.message).toContain("stray");
        expect(parsed.issues[0]?.path).toEqual(["tables", "entity", "rows", "stray"]);
        expect(parsed.value.tables["entity"]?.rowOrder).toEqual(["stray"]);
    });

    test("a row listed in the row order more than once is deduplicated", () => {
        const document = instanceDocument({
            entity: { rowOrder: ["row-1", "row-1"], rows: { "row-1": { fields: {} } } },
        });
        const parsed = expectOk(parseInstanceDocument(document));
        expect(parsed.issues.length).toBe(1);
        expect(parsed.issues[0]?.message).toContain("more than once");
        expect(parsed.issues[0]?.path).toEqual(["tables", "entity", "rowOrder", 1]);
        expect(parsed.value.tables["entity"]?.rowOrder).toEqual(["row-1"]);
    });

    test("a table without a row order gets the rows' key order", () => {
        const document = instanceDocument({ entity: { rows: { "row-1": { fields: {} } } } });
        const parsed = expectOk(parseInstanceDocument(document));
        expect(parsed.issues.length).toBe(1);
        expect(parsed.issues[0]?.path).toEqual(["tables", "entity", "rowOrder"]);
        expect(parsed.value.tables["entity"]?.rowOrder).toEqual(["row-1"]);
    });

    test("a malformed row is dropped from its table", () => {
        const document = instanceDocument({
            entity: { rowOrder: ["bad"], rows: { bad: "not-a-row" } },
        });
        const parsed = expectOk(parseInstanceDocument(document));
        expect(parsed.issues.length).toBe(1);
        expect(parsed.issues[0]?.path).toEqual(["tables", "entity", "rows", "bad"]);
        expect(parsed.value.tables["entity"]?.rowOrder).toEqual([]);
        expect(parsed.value.tables["entity"]?.rows["bad"]).toBeUndefined();
    });

    test("a non-instance document type fails the parse", () => {
        const document = { type: "mystery" } as unknown as Document;
        const result = parseInstanceDocument(document);
        expect(result.tag).toBe("Err");
        const issues = result.tag === "Err" ? result.content : [];
        expect(issues[0]?.path).toEqual(["type"]);
    });

    test("a missing name fails the parse", () => {
        const document = {
            type: "instance",
            instanceOf: { _id: "abc", _version: null, _server: "", type: "instance-of" },
            tables: {},
        } as unknown as Document;
        const result = parseInstanceDocument(document);
        expect(result.tag).toBe("Err");
        const issues = result.tag === "Err" ? result.content : [];
        expect(issues[0]?.path).toEqual(["name"]);
    });
});

// the first time tests run we incur the cost of loading the catlog-wasm bundle,
// so these tests have longer timeouts
describe("parsing of stored instances", { timeout: 20_000 }, () => {
    test("an instance with repairable table damage loads and reports issues", async () => {
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

        const loaded = expectOk(
            await binder.loadInstanceFromRef(schema, binder.getDocumentRef(instance.handle)),
        );
        const validation = await loaded.validate();
        const issue = validation.issues.find(
            (candidate) => candidate.issueType === "MalformedDocument",
        );
        expect(issue?.message).toContain("stray");
        expect(issue?.path).toEqual(["entity", "rows", "stray"]);
    });

    test("a change that breaks the row order surfaces as an issue on a repaired view", async () => {
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
        const added = expectOk(await instance.addRow(table));
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
        expect(broken.issues.length).toBe(1);
        expect(broken.issues[0]?.issueType).toBe("MalformedDocument");
        expect(broken.issues[0]?.message).toContain("stray");

        // The repaired view still exposes the table, with the stray row
        // appended to the row order.
        const brokenTable = broken.tables.find((candidate) => candidate.id === table.id);
        expect(brokenTable?.rows.map((row) => row.id)).toEqual([added.id, "stray"]);

        const read = broken.get([table.id]);
        expect(read.tag).toBe("Ok");
    });
});
