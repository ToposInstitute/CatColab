// @vitest-environment happy-dom
import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { createComputed, createRoot } from "solid-js";
import { describe, expect, test } from "vitest";

import { type InstanceValidation, createBinder, createInMemoryStore } from "catcolab-documents";
import { createInstanceValidationView } from "../src/index";

describe("reconciled instance validation views", { timeout: 20_000 }, () => {
    test("retain table identity and do not publish raw rows with a pending schema", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const first = schema.add(Entity, { label: "First" });
        const second = schema.add(Entity, { label: "Second" });
        const result = await binder.createInstance(schema, { title: "Data" });
        if (result.tag === "Err") {
            throw new Error("Expected instance");
        }
        const instance = result.content;
        let view!: ReturnType<typeof createInstanceValidationView>;
        let latestValidation: InstanceValidation | undefined;
        instance.onValidate((validation) => {
            latestValidation = validation;
        });
        const labels: Array<string | null | undefined> = [];
        const dispose = createRoot((dispose) => {
            view = createInstanceValidationView(instance);
            createComputed(() => {
                labels.push(view.data.tables[0]?.label);
            });
            return dispose;
        });
        await expect.poll(view.ready, { timeout: 20_000 }).toBe(true);
        // Snapshot the published result: the view must never mutate it.
        const published = latestValidation!;
        const table = view.data.tables[0]!;
        second.update({ label: "Unrelated" });
        await expect.poll(() => view.data.tables[1]?.label).toBe("Unrelated");
        expect(view.data.tables[0]).toBe(table);
        expect(labels).toEqual([undefined, "First"]);
        first.update({ label: "Renamed" });
        schema.add(Entity, { label: "New" });
        store.changeDocument(instance.handle, (document) => {
            if (document.type === "instance") {
                document.tables[table.id] = {
                    rows: { stray: { fields: {} } },
                    rowOrder: ["stray"],
                };
            }
        });
        // Retain the entire last published version while the new schema is pending.
        expect(view.data.tables[0]?.label).toBe("First");
        expect(view.data.tables[0]?.rows).toEqual([]);
        await expect.poll(() => view.data.tables.length).toBe(3);
        expect(view.data.tables[0]).toBe(table);
        expect(table.label).toBe("Renamed");
        expect(table.rows.map((row) => row.id)).toEqual(["stray"]);
        expect(published?.tables[0]?.label).toBe("First");
        expect(published?.tables[0]?.rows).toEqual([]);
        const before = [...labels];
        dispose();
        first.update({ label: "Released" });
        await instance.validate();
        expect(labels).toEqual(before);
        instance.dispose();
        schema.dispose();
    });
});
