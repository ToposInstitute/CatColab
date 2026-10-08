// @vitest-environment happy-dom
import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { createComputed, createRoot } from "solid-js";
import { describe, expect, test } from "vitest";

import { createBinder, createInMemoryStore } from "catcolab-documents";
import { createInstanceValidationView } from "../src";

describe("createInstanceValidationView", { timeout: 20_000 }, () => {
    test("publishes reconciled validation data and releases the subscription", async () => {
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

        const labels: Array<string | null | undefined> = [];
        let view!: ReturnType<typeof createInstanceValidationView>;
        const dispose = createRoot((dispose) => {
            view = createInstanceValidationView(instance);
            createComputed(() => labels.push(view.data.tables[0]?.label));
            return dispose;
        });
        expect(view.ready()).toBe(false);
        await expect.poll(view.ready, { timeout: 20_000 }).toBe(true);
        expect(view.data.issues).toEqual([]);

        // An unrelated table change retains the identity of the other table.
        const table = view.data.tables[0]!;
        second.update({ label: "Unrelated" });
        await expect.poll(() => view.data.tables[1]?.label).toBe("Unrelated");
        expect(view.data.tables[0]).toBe(table);

        first.update({ label: "Renamed" });
        await expect.poll(() => view.data.tables[0]?.label).toBe("Renamed");
        dispose();
        first.update({ label: "Released" });
        await instance.validate();
        expect(labels.at(-1)).toBe("Renamed");
        instance.dispose();
        schema.dispose();
    });
});
