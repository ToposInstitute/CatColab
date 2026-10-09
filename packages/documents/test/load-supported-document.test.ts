import { SimpleSchema } from "catcolab-logics/simple-schema";
import { expect, test } from "vitest";

import { Instance, LLMConversation, Model } from "catcolab-document-methods";
import { createBinder } from "catcolab-documents";

test("loads a model dump using its theory", async () => {
    const binder = createBinder();
    const document = Model.newModelDocument({ theory: SimpleSchema.theory });
    document.name = "Imported schema";
    const result = await binder.loadSupportedDocument([SimpleSchema], document);
    expect(result.tag).toBe("Ok");
    if (result.tag !== "Ok") {
        return;
    }
    expect(result.content.type).toBe("model");
    expect(result.content.document).toEqual(document);
    expect(result.content.title).toBe("Imported schema");
});

test("loads linked instance and conversation dumps through the store", async () => {
    const binder = createBinder();
    const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
    const schemaRef = binder.getDocumentRef(schema.handle);
    const instance = await binder.loadSupportedDocument(
        [SimpleSchema],
        Instance.newInstanceDocument({
            _id: schemaRef.id,
            _version: schemaRef.version,
            _server: schemaRef.server ?? "",
        }),
    );
    expect(instance.tag).toBe("Ok");
    if (instance.tag !== "Ok" || instance.content.type !== "instance") {
        throw new Error("Expected an instance");
    }
    expect(instance.content.schema.handle).toBe(schema.handle);

    const instanceRef = binder.getDocumentRef(instance.content.handle);
    const conversation = await binder.loadSupportedDocument(
        [SimpleSchema],
        LLMConversation.newLLMConversationDocument(
            {
                _id: instanceRef.id,
                _version: instanceRef.version,
                _server: instanceRef.server ?? "",
            },
            "test-model",
        ),
    );
    expect(conversation.tag).toBe("Ok");
    if (conversation.tag !== "Ok" || conversation.content.type !== "llmconversation") {
        throw new Error("Expected a conversation");
    }
    expect(conversation.content.attachment.handle).toBe(instance.content.handle);
});

test("uses the same errors as loading by ref", async () => {
    const binder = createBinder();
    const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
    expect(await binder.loadSupportedDocument([], schema.document)).toEqual(
        await binder.loadSupportedDocumentFromRef([], binder.getDocumentRef(schema.handle)),
    );
});
