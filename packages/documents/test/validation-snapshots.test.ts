import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test, vi } from "vitest";

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

describe("versioned validation", { timeout: 20_000 }, () => {
    test("one-shot validation captures inputs before awaiting the theory", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        schema.add(Entity, { label: "Original" });
        const pending = schema.validate();
        schema.add(Entity, { label: "New" });
        const old = await pending;
        expect(old.model.judgmentsOf(Entity).map((object) => object.label.join("."))).toEqual([
            "Original",
        ]);
        const current = await schema.validate();
        expect(current.model.judgmentsOf(Entity).map((object) => object.label.join("."))).toEqual([
            "Original",
            "New",
        ]);
        expect(current.revision).not.toBe(old.revision);
        expect(await schema.validate()).toBe(current);
    });

    test("instance subscriptions wait for the current schema and retain old tables", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        schema.add(Entity, { label: "Original" });
        const instance = expectOk(await binder.createInstance(schema, { title: "Data" }));
        const received: Array<InstanceValidation<typeof SimpleSchema>> = [];
        const stop = instance.onValidate((validation) => received.push(validation));
        await expect.poll(() => received.length).toBe(1);
        const old = received[0]!;
        expect(await instance.validate()).toBe(old);
        expect(received).toEqual([old]);
        const table = old.tables[0]!;
        schema.add(Entity, { label: "New" });
        store.changeDocument(instance.handle, (doc) => {
            if (doc.type === "instance") {
                doc.tables[table.id] = { rows: { stray: { fields: {} } }, rowOrder: ["stray"] };
            }
        });
        // No current rows are published against the old schema while it is pending.
        expect(received).toEqual([old]);
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
        entity.delete();
        expect(await pending).toMatchObject({ tag: "Err" });
        expect(instance.document.tables).toEqual({});
        instance.dispose();
        schema.dispose();
    });

    test("unsubscribe/resubscribe does not deliver an older in-flight validation", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        schema.add(Entity, { label: "Original" });
        const stale = vi.fn<() => void>();
        const stop = schema.onValidate(stale);
        stop();
        schema.add(Entity, { label: "New" });
        const current = vi.fn<() => void>();
        const stopCurrent = schema.onValidate(current);
        await expect.poll(() => current.mock.calls.length).toBe(1);
        expect(stale).not.toHaveBeenCalled();
        stopCurrent();
        schema.dispose();
    });
});
