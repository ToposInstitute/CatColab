import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { Attr, AttrType, Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { type Accessor, createEffect, createRoot } from "solid-js";
import { describe, expect, test } from "vitest";

import { createBinder, createInMemoryStore } from "catcolab-documents";
import {
    createInstanceValidation,
    createNotebookValidation,
    createSolidDocumentStore,
} from "../src";

describe("Solid validation accessors", { timeout: 20_000 }, () => {
    test("requires a Solid owner", async () => {
        const store = createSolidDocumentStore(createInMemoryStore());
        const notebook = await createBinder(store).createNotebook(SimpleOlog, { title: "An Olog" });

        expect(() => createNotebookValidation(notebook)).toThrow(
            "Validation accessors must be created within a Solid owner.",
        );
        store.dispose();
    });

    test("tracks notebook validation within its owner", async () => {
        const store = createSolidDocumentStore(createInMemoryStore());
        const notebook = await createBinder(store).createNotebook(SimpleOlog, { title: "An Olog" });
        const source = notebook.add(Type, { label: "A" });
        const target = notebook.add(Type, { label: "B" });
        notebook.add(Aspect, { label: "has", from: source, to: target });

        let validation!: ReturnType<typeof createNotebookValidation<typeof SimpleOlog>>;
        let labels: string[] = [];
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

        await expect.poll(() => validation()?.issues, { timeout: 20_000 }).toEqual([]);
        expect(labels).toEqual(["A", "B", "has"]);

        notebook.add(Type, { label: "C" });
        await expect.poll(() => labels).toEqual(["A", "B", "C", "has"]);

        dispose();
        const previous = validation();
        notebook.add(Type, { label: "D" });
        await new Promise((resolve) => setTimeout(resolve));
        expect(validation()).toBe(previous);
        store.dispose();
    });

    test("tracks schema and instance changes", async () => {
        const store = createSolidDocumentStore(createInMemoryStore());
        const binder = createBinder(store);
        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        const person = schema.add(Entity, { label: "Person" });
        const string = schema.add(AttrType, { label: "String" });
        schema.add(Attr, { label: "name", from: person, to: string });
        const result = await binder.createInstance(schema, { title: "Company instance" });
        if (result.tag === "Err") {
            throw new Error("Expected the instance to be created");
        }

        let validation!: Accessor<
            ReturnType<typeof result.content.validate> extends Promise<infer T>
                ? T | undefined
                : never
        >;
        const dispose = createRoot((dispose) => {
            validation = createInstanceValidation(result.content);
            return dispose;
        });

        await expect
            .poll(() => validation()?.tables.map((table) => table.label), { timeout: 20_000 })
            .toEqual(["Person"]);
        const table = validation()?.tables[0];
        if (!table) {
            throw new Error("Expected the Person table");
        }
        const row = await result.content.addRow(table, { name: "Alice" });
        expect(row.tag).toBe("Ok");
        await expect.poll(() => validation()?.tables[0]?.rows.length).toBe(1);

        schema.add(Attr, { label: "role", from: person, to: string });
        await expect
            .poll(() => validation()?.issues.map((issue) => issue.issueType))
            .toEqual(["MissingValue"]);

        dispose();
        store.dispose();
    });
});
