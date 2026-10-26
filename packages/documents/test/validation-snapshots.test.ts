import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import {
    createBinder,
    createInMemoryStore,
    type InstanceValidation,
    type Result,
} from "catcolab-documents";

function expectOk<T, E>(result: Result<T, E>): T {
    if (result.tag === "Err") {
        throw new Error("Expected Ok");
    }
    return result.content;
}

describe("validation snapshots", { timeout: 20_000 }, () => {
    test("validation reads after loading the theory and returns fresh results", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        schema.add(Entity, { label: "Original" });
        const pending = schema.validate();
        schema.add(Entity, { label: "New" });
        const current = await pending;
        expect(current.model.judgmentsOf(Entity).map((object) => object.label.join("."))).toEqual([
            "Original",
            "New",
        ]);
        expect(await schema.validate()).not.toBe(current);
        schema.add(Entity, { label: "Later" });
        const next = await schema.validate();
        expect(next.model.judgmentsOf(Entity)).toHaveLength(3);
        expect(current.model.judgmentsOf(Entity).map((object) => object.label.join("."))).toEqual([
            "Original",
            "New",
        ]);
        schema.dispose();
    });

    test("instance subscriptions publish edits and retain old tables", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        schema.add(Entity, { label: "Original" });
        const instance = expectOk(await binder.createInstance(schema, { title: "Data" }));
        const received: Array<InstanceValidation<typeof SimpleSchema>> = [];
        const stop = instance.onValidate((validation) => received.push(validation));
        await expect.poll(() => received.length).toBe(1);
        const old = received[0]!;
        const validated = await instance.validate();
        expect(validated).not.toBe(old);
        expect(received.at(-1)).not.toBe(old);
        const previousCount = received.length;
        const table = old.tables[0]!;
        schema.add(Entity, { label: "New" });
        store.changeDocument(instance.handle, (doc) => {
            if (doc.type === "instance") {
                doc.tables[table.id] = { rows: { stray: { fields: {} } }, rowOrder: ["stray"] };
            }
        });
        // Instance edits publish immediately using the latest available schema.
        expect(received).toHaveLength(previousCount + 1);
        expect(received.at(-1)?.tables.map((table) => table.label)).toEqual(["Original"]);
        expect(received.at(-1)?.tables[0]?.rows.map((row) => row.id)).toEqual(["stray"]);
        await expect
            .poll(() => received.at(-1)?.tables.map((table) => table.label))
            .toEqual(["Original", "New"]);
        expect(received.at(-1)?.tables[0]?.rows.map((row) => row.id)).toEqual(["stray"]);
        expect(old.tables[0]?.rows).toEqual([]);
        expect(old.get([table.id, "rows", "stray"]).tag).toBe("Err");
        stop();
        instance.dispose();
        schema.dispose();
    });

    test("commands recheck the schema after asynchronous validation", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const entity = schema.add(Entity, { label: "Original" });
        const instance = expectOk(await binder.createInstance(schema, { title: "Data" }));
        const table = (await instance.validate()).tables[0]!;
        const pending = instance.addRow(table);
        schema.delete(entity);
        expect(await pending).toMatchObject({ tag: "Err" });
        expect(instance.data().tables).toEqual([]);
        instance.dispose();
        schema.dispose();
    });
});
