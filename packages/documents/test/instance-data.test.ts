import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import { createBinder, createInMemoryStore, type Result } from "catcolab-documents";
import { parseInstanceData, getInstanceData } from "../src/instance/data";
import {
    indexInstanceTables,
    readInstancePath,
    tablesWithOrphanedData,
} from "../src/instance/table-methods";
import { validateInstanceTables } from "../src/instance/validation";

function expectOk<T, E>(result: Result<T, E>): T {
    if (result.tag === "Err") {
        throw new Error("Expected a successful result");
    }
    return result.content;
}

function snapshot<T>(tables: T) {
    return {
        type: "instance",
        name: "Data",
        version: "1",
        instanceOf: { type: "instance-of", _id: "schema", _version: null, _server: "" },
        tables,
    };
}

describe("instance data", { timeout: 20000 }, () => {
    test.each(["bad", 3])("leaves field payloads unchanged for schema validation: %j", (value) => {
        const document = snapshot({
            entity: { rows: { row: { fields: { x: { Bool: value } } } }, rowOrder: ["row"] },
        });
        const result = parseInstanceData(document);
        if (result.tag === "Err") {
            throw new Error("Expected recoverable instance data");
        }
        const data = result.content.value;
        const index = indexInstanceTables(data.tables);
        const tables = tablesWithOrphanedData(index, []).map((table) =>
            Object.assign({}, table, {
                headers: table.headers.map((header) =>
                    Object.assign({}, header, { type: { tag: "Bool" as const } }),
                ),
            }),
        );
        expect(
            readInstancePath(index, tables, ["entity", "rows", "row", "fields", "x"]),
        ).toMatchObject({
            tag: "Ok",
            content: { tag: "Bool", content: { value } },
        });
        expect(validateInstanceTables(data, tables)).toMatchObject([
            { path: ["entity", "rows", "row", "fields", "x"], issueType: "MistypedLiteral" },
        ]);
    });

    test("reads repair order without persisting it and retain older snapshots", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        schema.add(Entity, { label: "Company" });
        const instance = expectOk(await binder.createInstance(schema, { title: "Instance" }));
        const validation = await instance.validate();
        const table = validation.tables[0]!;
        const initial = getInstanceData(store, instance.handle);
        expect(instance.data()).toBe(expectOk(initial).value);
        expect(instance.data()).toBe(instance.data());
        expect(table.rows).toEqual([]);
        store.changeDocument(instance.handle, (doc) => {
            if (doc.type === "instance") {
                doc.tables[table.id] = { rows: { stray: { fields: {} } }, rowOrder: [] };
            }
        });
        expect(table.rows).toEqual([]);
        expect(validation.get([table.id, "rows", "stray"]).tag).toBe("Err");
        const current = await instance.validate();
        expect(current.tables[0]?.rows.map((row) => row.id)).toEqual(["stray"]);
        expect(current.tables[0]?.rows[0]?.index).toBe(0);
        expect(current.tables[0]?.rows[0]?.fields).toEqual([]);
        const after = getInstanceData(store, instance.handle);
        expect(after).not.toBe(initial);
        expect(instance.data()).toBe(expectOk(after).value);
        expect(structuredClone(instance.data())).toEqual(instance.data());
        expect(instance.dump().tables[table.id]?.rowOrder).toEqual([]);
        schema.add(Entity, { label: "Other" });
        await instance.validate();
        expect(getInstanceData(store, instance.handle)).toBe(after);
        instance.dispose();
    });
});
