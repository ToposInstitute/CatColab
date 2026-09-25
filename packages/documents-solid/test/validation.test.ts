import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { Attr, AttrType, Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { createEffect, createRoot } from "solid-js";
import { describe, expect, test } from "vitest";

import { createBinder, createInMemoryStore } from "catcolab-documents";
import {
    createInstanceValidation,
    createNotebookValidation,
    createSolidDocumentStore,
} from "../src";

describe("Solid validation accessors", { timeout: 20_000 }, () => {
    test("tracks notebook validation and releases the subscription", async () => {
        const store = createSolidDocumentStore(createInMemoryStore());
        const notebook = await createBinder(store).createNotebook(SimpleOlog, { title: "An Olog" });
        const source = notebook.add(Type, { label: "A" });
        const target = notebook.add(Type, { label: "B" });
        notebook.add(Aspect, { label: "has", from: source, to: target });

        expect(() => createNotebookValidation(notebook)).toThrow("Solid owner");
        let labels: string[] = [];
        let validation!: ReturnType<typeof createNotebookValidation<typeof SimpleOlog>>;
        const dispose = createRoot((dispose) => {
            validation = createNotebookValidation(notebook);
            createEffect(() => {
                labels =
                    validation()
                        ?.model.judgments()
                        .map((item) => item.label.join(".")) ?? [];
            });
            return dispose;
        });
        expect(validation()).toBeUndefined();
        await expect.poll(() => validation(), { timeout: 20_000 }).toBeDefined();
        expect(validation()?.issues).toEqual([]);
        await expect.poll(() => labels).toEqual(["A", "B", "has"]);
        notebook.add(Type, { label: "C" });
        await expect.poll(() => labels).toEqual(["A", "B", "C", "has"]);
        const previous = validation();
        dispose();
        notebook.add(Type, { label: "D" });
        expect(validation()).toBe(previous);
        store.dispose();
    });

    test("tracks instance and schema edits", async () => {
        const store = createSolidDocumentStore(createInMemoryStore());
        const binder = createBinder(store);
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const person = schema.add(Entity, { label: "Person" });
        const string = schema.add(AttrType, { label: "String" });
        schema.add(Attr, { label: "name", from: person, to: string });
        const result = await binder.createInstance(schema, { title: "Instance" });
        if (result.tag !== "Ok") {
            throw new Error("Expected an instance");
        }

        let validation!: ReturnType<
            typeof createInstanceValidation<
                typeof result.content.handle,
                typeof SimpleSchema,
                unknown
            >
        >;
        const dispose = createRoot((dispose) => {
            validation = createInstanceValidation(result.content);
            return dispose;
        });
        await expect.poll(() => validation(), { timeout: 20_000 }).toBeDefined();
        await expect
            .poll(() => validation()?.tables.map((table) => table.label))
            .toEqual(["Person"]);
        const table = validation()?.tables[0];
        if (!table) {
            throw new Error("Expected a table");
        }
        const row = await result.content.addRow(table, { name: "Alice" });
        expect(row.tag).toBe("Ok");
        await expect.poll(() => validation()?.tables[0]?.rows.length).toBe(1);
        schema.add(Attr, { label: "role", from: person, to: string });
        await expect
            .poll(() => validation()?.issues.map((issue) => issue.issueType))
            .toEqual(["MissingValue"]);

        store.changeDocument(result.content.handle, (document) => {
            const stored = document as unknown as {
                tables: Record<
                    string,
                    {
                        rows: Record<string, { fields: Record<string, { Int: number }> }>;
                        rowOrder: string[];
                    }
                >;
            };
            stored.tables["ghost-table"] = {
                rows: { "ghost-row": { fields: { mystery: { Int: 3 } } } },
                rowOrder: ["ghost-row"],
            };
        });
        await expect
            .poll(() => validation()?.issues.map((issue) => issue.issueType))
            .toContain("OrphanedTable");
        expect(
            validation()?.get(["ghost-table", "rows", "ghost-row", "fields", "mystery"]),
        ).toMatchObject({
            tag: "Ok",
            content: { tag: "Int", content: { value: 3 } },
        });
        dispose();
        store.dispose();
    });
});
