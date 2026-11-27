import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

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
        const schemaRefId = schema.ref.id;
        const diagram = await store.createHandle(
            Diagram.newDiagramDocument({ _id: schemaRefId, _version: null, _server: "" }),
        );
        schema.add(Entity, { label: "Person" });

        const usedBy = binder.listRelatedDocuments(schema.ref, { direction: "used-by" });
        expect(usedBy).toEqual({
            "analysis-of": [],
            "diagram-in": [expect.objectContaining({ ref: store.getDocumentRef(diagram) })],
            "instance-of": [expect.objectContaining({ ref: instance.ref, name: "Data" })],
            "llmconversation-of": [expect.objectContaining({ ref: conversation.ref })],
            instantiation: [],
        });
        expect(
            binder.listRelatedDocuments(store.getDocumentRef(diagram), { direction: "depends-on" })[
                "diagram-in"
            ],
        ).toEqual([expect.objectContaining({ ref: schema.ref })]);
        expect(
            binder.listRelatedDocuments(other.ref, { direction: "used-by" })["instance-of"],
        ).toHaveLength(1);
        expect(binder.listRelatedDocuments(instance.ref, { direction: "depends-on" })).toEqual({
            "analysis-of": [],
            "diagram-in": [],
            "instance-of": [expect.objectContaining({ ref: schema.ref })],
            "llmconversation-of": [],
            instantiation: [],
        });
        expect(
            binder.listRelatedDocuments(conversation.ref, { direction: "depends-on" })[
                "llmconversation-of"
            ],
        ).toEqual([expect.objectContaining({ ref: schema.ref })]);

        // The schema depends on no document, and nothing depends on the
        // instance.
        const empty = {
            "analysis-of": [],
            "diagram-in": [],
            "instance-of": [],
            "llmconversation-of": [],
            instantiation: [],
        };
        expect(binder.listRelatedDocuments(schema.ref, { direction: "depends-on" })).toEqual(empty);
        expect(binder.listRelatedDocuments(instance.ref, { direction: "used-by" })).toEqual(empty);

        // Drafts are invisible to the query: staging a draft of the instance
        // does not make it (or its clone) appear twice.
        const draft = store.createDraft(expectOk(await store.getHandle(instance.ref)));
        store.changeDocument(draft, (doc) => {
            if (doc.type === "instance") {
                doc.instanceOf._id = other.ref.id;
            }
        });
        expect(binder.listRelatedDocuments(schema.ref, { direction: "used-by" })).toEqual(usedBy);
        expect(
            binder.listRelatedDocuments(other.ref, { direction: "used-by" })["instance-of"],
        ).toHaveLength(1);
        store.discardDraft(draft);
        expect(binder.listRelatedDocuments(schema.ref, { direction: "used-by" })).toEqual(usedBy);
    });
});
