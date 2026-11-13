import { PetriNet } from "catcolab-logics/petri-net";
import { SimpleSchema } from "catcolab-logics/simple-schema";
import { expect, test } from "vitest";

import { Instance, LLMConversation, Model } from "catcolab-document-methods";
import { createBinder, createInMemoryStore } from "catcolab-documents";

test("loads a model dump using its theory", async () => {
    const binder = createBinder({ shapes: [SimpleSchema] });
    const document = Model.newModelDocument({ theory: SimpleSchema.theory });
    document.name = "Imported schema";
    const result = await binder.loadSupportedDocument(document);
    expect(result.tag).toBe("Ok");
    if (result.tag !== "Ok") {
        return;
    }
    expect(result.content.type).toBe("model");
    expect(result.content.dump()).toEqual(document);
    expect(result.content.title).toBe("Imported schema");
});

test("loads linked instance and conversation dumps through the store", async () => {
    const binder = createBinder(createInMemoryStore(), { shapes: [SimpleSchema] });
    const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
    const schemaRef = binder.getDocumentRef(schema.handle);
    const instance = await binder.loadSupportedDocument(
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
    const reloaded = await binder.loadSupportedDocumentFromRef(
        binder.getDocumentRef(conversation.content.handle),
    );
    expect(reloaded.tag).toBe("Ok");
    if (reloaded.tag !== "Ok" || reloaded.content.type !== "llmconversation") {
        throw new Error("Expected a conversation");
    }
    expect(reloaded.content.attachment.type).toBe("instance");
});

test("uses the same errors as loading by ref", async () => {
    const binder = createBinder();
    const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
    const result = await binder.loadSupportedDocument(schema.dump());
    expect(result).toEqual({
        tag: "Err",
        content: [
            {
                message: `No shape is available for theory "${SimpleSchema.theory}".`,
                path: ["theory"],
            },
        ],
    });
    expect(result).toEqual(
        await binder.loadSupportedDocumentFromRef(binder.getDocumentRef(schema.handle)),
    );
});

test("loads every registered theory without requiring instance support", async () => {
    const binder = createBinder({ shapes: [SimpleSchema, PetriNet] });
    for (const shape of [SimpleSchema, PetriNet]) {
        const notebook = await binder.createNotebook(shape, { title: shape.theory });
        const result = await binder.loadSupportedDocumentFromRef(
            binder.getDocumentRef(notebook.handle),
        );
        expect(result.tag).toBe("Ok");
        if (result.tag !== "Ok" || result.content.type !== "model") {
            throw new Error("Expected a model");
        }
        expect(result.content.shape).toBe(shape);
        const instance = await binder.createInstance(result.content, { title: "" });
        expect(instance.tag).toBe(shape.supportsInstances ? "Ok" : "Err");
    }
});

test("rejects unknown theories with a configured registry", async () => {
    const binder = createBinder({ shapes: [SimpleSchema] });
    const document = Model.newModelDocument({ theory: "unknown-theory" });
    expect(await binder.loadSupportedDocument(document)).toEqual({
        tag: "Err",
        content: [
            {
                message: 'No shape is available for theory "unknown-theory".',
                path: ["theory"],
            },
        ],
    });
});
