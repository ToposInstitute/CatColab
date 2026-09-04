// The in-memory store's `listInstancesOf`: every instance document linking
// back to a document, with drafts and unrelated documents excluded.
import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import { createBinder, createInMemoryStore, type Result } from "catcolab-documents";

function expectOk<T, E>(result: Result<T, E>): T {
    expect(result.tag).toBe("Ok");
    if (result.tag === "Err") {
        throw new Error(`Expected Ok, got ${JSON.stringify(result.content)}`);
    }
    return result.content;
}

describe("in-memory store", () => {
    test("lists the instances linking back to a document", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);

        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const other = await binder.createNotebook(SimpleSchema, { title: "Other" });
        const instance = expectOk(await binder.createInstance(schema, { title: "Data" }));
        expectOk(await binder.createInstance(other, { title: "Other data" }));
        schema.add(Entity, { label: "Person" });

        const schemaInstances = await store.listInstancesOf(schema.handle);
        expect(schemaInstances).toEqual([instance.handle]);
        expect((await store.listInstancesOf(other.handle)).length).toBe(1);

        // Instances do not have instances of their own.
        expect(await store.listInstancesOf(instance.handle)).toEqual([]);

        // Drafts are invisible to the query: staging a draft of the instance
        // does not make it (or its clone) appear twice.
        const draft = store.createDraft(instance.handle);
        expect(await store.listInstancesOf(schema.handle)).toEqual([instance.handle]);
        store.discardDraft(draft);
    });
});
