import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

// The in-memory store's link-indexed relation queries.
import { Diagram } from "catcolab-document-methods";
import { createBinder, createInMemoryStore, type Result } from "catcolab-documents";

function expectOk<T, E>(result: Result<T, E>): T {
    expect(result.tag).toBe("Ok");
    if (result.tag === "Err") {
        throw new Error(`Expected Ok, got ${JSON.stringify(result.content)}`);
    }
    return result.content;
}

describe("in-memory store", () => {
    test("lists related documents indexed by link type", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);

        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const other = await binder.createNotebook(SimpleSchema, { title: "Other" });
        const instance = expectOk(await binder.createInstance(schema, { title: "Data" }));
        expectOk(await binder.createInstance(other, { title: "Other data" }));
        const conversation = await binder.createLLMConversation(schema, "test-model", {
            title: "Conversation",
        });
        const schemaRefId = store.getDocumentRef(schema.handle).id;
        const diagram = await store.createHandle(
            Diagram.newDiagramDocument({ _id: schemaRefId, _version: null, _server: "" }),
        );
        schema.add(Entity, { label: "Person" });

        expect(await store.listUsedBy(schema.handle)).toEqual({
            "analysis-of": [],
            "diagram-in": [diagram],
            "instance-of": [instance.handle],
            "llmconversation-of": [conversation.handle],
            instantiation: [],
        });
        expect((await store.listDependsOn(diagram))["diagram-in"]).toEqual([schema.handle]);
        expect((await store.listUsedBy(other.handle))["instance-of"]).toHaveLength(1);

        expect(await store.listDependsOn(instance.handle)).toEqual({
            "analysis-of": [],
            "diagram-in": [],
            "instance-of": [schema.handle],
            "llmconversation-of": [],
            instantiation: [],
        });
        expect((await store.listDependsOn(conversation.handle))["llmconversation-of"]).toEqual([
            schema.handle,
        ]);

        // The schema depends on no document, and nothing depends on the
        // instance.
        expect(await store.listDependsOn(schema.handle)).toEqual({
            "analysis-of": [],
            "diagram-in": [],
            "instance-of": [],
            "llmconversation-of": [],
            instantiation: [],
        });
        expect(await store.listUsedBy(instance.handle)).toEqual({
            "analysis-of": [],
            "diagram-in": [],
            "instance-of": [],
            "llmconversation-of": [],
            instantiation: [],
        });

        // Drafts are invisible to the query: staging a draft of the instance
        // does not make it (or its clone) appear twice.
        const draft = store.createDraft(instance.handle);
        expect((await store.listUsedBy(schema.handle))["instance-of"]).toEqual([instance.handle]);
        store.discardDraft(draft);
    });
});
