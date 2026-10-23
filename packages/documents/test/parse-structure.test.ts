import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import { Instance, Model } from "catcolab-document-methods";
import {
    createBinder,
    createInMemoryStore,
    parseInstanceStructure,
    parseModelNotebookStructure,
    parseInstanceData,
    parseNotebookData,
    type Result,
} from "catcolab-documents";

const link = { type: "instance-of" as const, _id: "schema", _version: null, _server: "" };

function ok<T, E>(result: Result<T, E>): T {
    expect(result.tag).toBe("Ok");
    if (result.tag === "Err") {
        throw new Error("Expected parsed structure");
    }
    return result.content;
}

describe("essential snapshot structure", () => {
    test("valid snapshots are unchanged and parsing reuses snapshot identity", () => {
        const snapshot = Instance.newInstanceDocument(link);
        snapshot.tables["people"] = { rows: { alice: { fields: {} } }, rowOrder: ["alice"] };
        const parsed = parseInstanceStructure(snapshot);
        expect(parsed).toEqual({ value: snapshot, issues: [] });
        expect(parseInstanceStructure(snapshot)).toBe(parsed);
    });

    test("normalizes containers and row ordering without changing storage", () => {
        const snapshot = {
            ...Instance.newInstanceDocument(link),
            tables: {
                people: {
                    rows: { alice: { fields: {} }, bob: {}, broken: null },
                    rowOrder: ["alice", "alice", "missing", 7],
                },
                broken: null,
            },
        };
        const before = structuredClone(snapshot);
        const parsed = parseInstanceStructure(snapshot);
        expect(parsed.value.tables).toEqual({
            people: {
                rows: { alice: { fields: {} }, bob: { fields: {} } },
                rowOrder: ["alice", "bob"],
            },
        });
        expect(parsed.issues.map((issue) => issue.path)).toEqual([
            ["tables", "people", "rows", "bob", "fields"],
            ["tables", "people", "rows", "broken"],
            ["tables", "people", "rowOrder"],
            ["tables", "broken"],
        ]);
        const data = ok(parseInstanceData(snapshot));
        expect(data.issues).toEqual(parsed.issues);
        expect(data.value.tables[0]?.rows.map((row) => row.id)).toEqual(["alice", "bob"]);
        expect(snapshot).toEqual(before);
        const missing = parseInstanceStructure({ ...snapshot, tables: undefined });
        expect(missing.value.tables).toEqual({});
        expect(missing.issues[0]?.path).toEqual(["tables"]);
    });

    test("normalizes only notebook containers and ordering", () => {
        const snapshot = {
            ...Model.newModelDocument({ theory: "simple-schema" }),
            notebook: {
                cellContents: {
                    a: { tag: "rich-text", id: "wrong", content: "Notes" },
                    b: { tag: "rich-text", id: "b", content: "More" },
                },
                cellOrder: ["a", "a", "missing"],
            },
        };
        const parsed = parseModelNotebookStructure(snapshot);
        expect(parsed.value.notebook.cellOrder).toEqual(["a", "b"]);
        expect(parsed.value.notebook.cellContents).toBe(snapshot.notebook.cellContents);
        const data = ok(parseNotebookData(snapshot));
        expect(data.issues).toEqual(parsed.issues);
        expect(data.value.cells.map((cell) => cell.id)).toEqual(["a", "b"]);
        expect(parsed.issues.map((issue) => issue.path)).toContainEqual(["notebook", "cellOrder"]);
        const missing = parseModelNotebookStructure({ ...snapshot, notebook: null });
        expect(missing.value.notebook).toEqual({ cellContents: {}, cellOrder: [] });
        expect(missing.issues.length).toBeGreaterThan(0);
    });

    test("elaboration uses raw notebook order rather than repaired data", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        notebook.add(Entity, { label: "Unordered" });
        store.changeDocument(notebook.handle, (document) => {
            if (document.type === "model") {
                document.notebook.cellOrder = [];
            }
        });
        expect(notebook.data().cells).toHaveLength(1);
        const validation = await notebook.validate();
        expect(validation.model.judgments()).toEqual([]);
        expect(validation.issues).toEqual([]);
        expect(notebook.dump().notebook.cellOrder).toEqual([]);
        notebook.dispose();
    }, 20_000);

    test("instance validation reports malformed containers without persisting repairs", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const instance = ok(await binder.createInstance(schema, { title: "Data" }));
        store.changeDocument(instance.handle, (document) => {
            if (document.type === "instance") {
                Object.assign(document, { tables: null });
            }
        });
        expect(instance.data().tables).toEqual([]);
        expect((await instance.validate()).issues).toContainEqual({
            issueType: "MalformedDocument",
            message: expect.any(String),
            path: [],
        });
        expect(instance.dump().tables).toBeNull();
        instance.dispose();
        schema.dispose();
    }, 20_000);

    test("instance validation reports damage and exposes recoverable rows after edits", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const person = schema.add(Entity, { label: "Person" });
        const instance = ok(await binder.createInstance(schema, { title: "People" }));
        const table = (await instance.validate()).tables.find(
            (table) => table.label === person.label,
        )!;
        // The schema-derived table legitimately has no stored data yet.
        expect(table.rows).toEqual([]);
        store.changeDocument(instance.handle, (document) => {
            if (document.type !== "instance") {
                throw new Error("Expected instance");
            }
            document.tables[table.id] = {
                rows: { alice: { fields: {} } },
                rowOrder: ["missing", "alice", "alice"],
            };
        });
        const validation = await instance.validate();
        expect(validation.issues).toContainEqual({
            issueType: "MalformedDocument",
            message: expect.any(String),
            path: [table.id, "rowOrder"],
        });
        expect(ok(parseInstanceData(instance.dump())).issues).toContainEqual({
            message: expect.any(String),
            path: ["tables", table.id, "rowOrder"],
        });
        expect(validation.tables[0]?.rows.map((row) => row.id)).toEqual(["alice"]);
        expect(instance.dump().tables[table.id]?.rowOrder).toEqual(["missing", "alice", "alice"]);
        store.changeDocument(instance.handle, (document) => {
            if (document.type === "instance") {
                document.tables[table.id]!.rowOrder = ["alice"];
            }
        });
        expect((await instance.validate()).issues).toEqual([]);
    }, 20_000);
});
