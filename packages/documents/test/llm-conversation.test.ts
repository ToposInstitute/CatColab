import { SimpleOlog } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

import { LLMConversation as LLMConversationMethods } from "catcolab-document-methods";
import { createBinder, llmConversationFromStore } from "catcolab-documents";

async function createConversation(binder: ReturnType<typeof createBinder>, title: string) {
    const model = await binder.createNotebook(SimpleOlog, { title: "Attached model" });
    return binder.createLLMConversation(model, "test-model", { title });
}

describe("LLM conversation documents", () => {
    test("createLLMConversation links the conversation to its attachment", async () => {
        const binder = createBinder();
        const model = await binder.createNotebook(SimpleOlog, { title: "Attached model" });
        const conversation = await binder.createLLMConversation(model, "test-model", {
            title: "A conversation",
        });

        expect(conversation.title).toBe("A conversation");
        expect(conversation.attachment).toBe(model);
        expect(conversation.document.type).toBe("llmconversation");
        expect(conversation.document.llmModel).toBe("test-model");

        const modelRef = binder.store.getDocumentRef(model.handle);
        expect(conversation.document.llmConversationOf).toMatchObject({
            _id: modelRef.id,
            _version: modelRef.version,
            type: "llmconversation-of",
        });
        expect(conversation.interactions()).toHaveLength(0);

        // The link can be resolved back to the attachment's handle through the store.
        const resolved = await binder.store.getHandle({
            id: conversation.document.llmConversationOf._id,
            version: null,
        });
        expect(resolved.tag).toBe("Ok");
        if (resolved.tag !== "Ok") {
            return;
        }
        expect(resolved.content).toBe(model.handle);
    });

    test("interactions are appended in order and readable from the document view", async () => {
        const binder = createBinder();
        const conversation = await createConversation(binder, "A conversation");

        const userMessage = LLMConversationMethods.newUserMessage("Hello.", []);
        const llmMessage = LLMConversationMethods.newLLMMessage("Hi there.");
        conversation.appendInteraction(userMessage);
        conversation.appendInteraction(llmMessage);

        expect(conversation.interactions().map((interaction) => interaction.tag)).toEqual([
            "user-message",
            "llm-message",
        ]);
        expect(conversation.document.interactions[0]).toMatchObject({
            tag: "user-message",
            content: "Hello.",
        });
    });

    test("a new user message rejects pending feedback requests", async () => {
        const binder = createBinder();
        const conversation = await createConversation(binder, "A conversation");

        conversation.appendInteraction({
            tag: "user-feedback-request",
            id: "feedback-request",
            timestamp: new Date().toISOString(),
            codeExecution: "code-execution",
            content: "Apply the proposed changes?",
            resolution: "unresolved",
        });
        conversation.rejectPendingFeedbackRequests();

        const request = conversation.interactions()[0];
        expect(request?.tag).toBe("user-feedback-request");
        if (request?.tag !== "user-feedback-request") {
            return;
        }
        expect(request.resolution).toBe("rejected");
    });

    test("feedback requests are resolved by id", async () => {
        const binder = createBinder();
        const conversation = await createConversation(binder, "A conversation");

        conversation.appendInteraction({
            tag: "user-feedback-request",
            id: "feedback-request",
            timestamp: new Date().toISOString(),
            codeExecution: "code-execution",
            content: "Apply the proposed changes?",
            resolution: "unresolved",
        });

        expect(conversation.resolveFeedbackRequest("feedback-request", "approved")).toBe(true);
        expect(conversation.resolveFeedbackRequest("feedback-request", "rejected")).toBe(false);
        expect(conversation.resolveFeedbackRequest("no-such-request", "approved")).toBe(false);

        const request = conversation.interactions()[0];
        expect(request?.tag).toBe("user-feedback-request");
        if (request?.tag !== "user-feedback-request") {
            return;
        }
        expect(request.resolution).toBe("approved");
    });

    test("update renames the conversation", async () => {
        const binder = createBinder();
        const conversation = await createConversation(binder, "Old title");

        conversation.update({ title: "New title" });
        expect(conversation.title).toBe("New title");

        conversation.update({});
        expect(conversation.title).toBe("New title");
    });

    test("dump returns a plain copy detached from the store", async () => {
        const binder = createBinder();
        const conversation = await createConversation(binder, "A conversation");
        conversation.appendInteraction(LLMConversationMethods.newUserMessage("Hello.", []));

        const dump = conversation.dump();
        expect(dump.interactions).toHaveLength(1);

        conversation.appendInteraction(LLMConversationMethods.newLLMMessage("Hi there."));
        expect(dump.interactions).toHaveLength(1);
        expect(conversation.interactions()).toHaveLength(2);
    });

    test("onChange notifies on mutations and unsubscribes", async () => {
        const binder = createBinder();
        const conversation = await createConversation(binder, "A conversation");

        let notifications = 0;
        const unsubscribe = conversation.onChange(() => {
            notifications += 1;
        });

        conversation.appendInteraction(LLMConversationMethods.newUserMessage("Hello.", []));
        conversation.update({ title: "Renamed" });
        expect(notifications).toBe(2);

        unsubscribe();
        conversation.appendInteraction(LLMConversationMethods.newLLMMessage("Hi there."));
        expect(notifications).toBe(2);
    });

    test("llmConversationFromStore wraps an existing handle", async () => {
        const binder = createBinder();
        const created = await createConversation(binder, "A conversation");

        const conversation = llmConversationFromStore(
            binder.store,
            created.handle,
            created.attachment,
        );
        expect(conversation.title).toBe("A conversation");
        expect(conversation.document.llmModel).toBe("test-model");
    });
});
