import { Repo } from "@automerge/automerge-repo";
import { assert, describe, test, vi } from "vitest";

import { LLMConversation, type LLMConversationDocument } from "catcolab-document-methods";
import type { InlineFile } from "catcolab-document-types";
import { makeLiveDoc } from "../api";
import type {
    GeneratedOpenAIMessage,
    OpenAIChatTurnResult,
    OpenAITranscript,
} from "../inference/chat.ts";
import type { ContextExecScope } from "../inference/context_exec.ts";
import { type LiveLLMConversationDoc, runLLMConversationTurn } from "./document.ts";

const inference = vi.hoisted(() => ({
    createInferenceClient: vi.fn<(apiKey: string) => unknown>(),
    runOpenAIChatTurn:
        vi.fn<
            (
                client: unknown,
                transcript: OpenAITranscript,
                scope: ContextExecScope,
                onContent?: (delta: string, snapshot: string) => void,
                model?: string,
            ) => Promise<OpenAIChatTurnResult>
        >(),
}));

vi.mock("../inference/chat.ts", async (importOriginal) => ({
    ...(await importOriginal()),
    ...inference,
}));

const modelRef = {
    _id: "0198b0e0-2085-1000-8000-000000000001",
    _version: null,
    _server: "example.test",
};

function makeLiveConversation(): LiveLLMConversationDoc {
    const repo = new Repo();
    const document = LLMConversation.newLLMConversationDocument(modelRef, "test-model");
    const liveDoc = makeLiveDoc<LLMConversationDocument>(repo.create(document), "llmconversation");

    return {
        type: "llmconversation",
        liveDoc,
        docRef: {
            refId: "0198b0e0-2085-1000-8000-000000000010",
            permissions: { anyone: null, user: "Own", users: null },
            isDeleted: false,
        },
        liveModel: {} as LiveLLMConversationDoc["liveModel"],
    };
}

const inputFile: InlineFile = {
    filename: "values.csv",
    fileType: "CSV",
    content: Array.from(new TextEncoder().encode("left,right\n0,1\n")),
};

const generatedMessageDelta: GeneratedOpenAIMessage[] = [
    {
        role: "assistant",
        content: null,
        tool_calls: [
            {
                id: "call_multiply",
                type: "function",
                function: {
                    name: "contextExec",
                    arguments: JSON.stringify({ code: "return files['values.csv'];" }),
                },
            },
        ],
    },
    {
        role: "tool",
        tool_call_id: "call_multiply",
        content: JSON.stringify({ tag: "Ok", value: "left,right\n0,1\n" }),
    },
    { role: "assistant", content: "The values are 0 and 1." },
];

describe("LLM conversation turns", () => {
    test("persists a completed user, tool, and assistant turn", async () => {
        const conversation = makeLiveConversation();
        inference.createInferenceClient.mockReturnValue({});
        inference.runOpenAIChatTurn.mockResolvedValue({
            content: "The values are 0 and 1.",
            generatedMessageDelta,
        });

        assert.deepStrictEqual(
            await runLLMConversationTurn({
                conversation,
                inferenceKey: { tag: "Ready", key: "inference-key" },
                userInput: { content: "Inspect the attached file.", files: [inputFile] },
                contextExecScope: {},
            }),
            { tag: "Completed", content: "The values are 0 and 1." },
        );

        const scope = inference.runOpenAIChatTurn.mock.calls[0]?.[2] as ContextExecScope;
        assert.deepStrictEqual(scope.files, { "values.csv": "left,right\n0,1\n" });
        assert.strictEqual(inference.runOpenAIChatTurn.mock.calls[0]?.[4], "test-model");

        const interactions = conversation.liveDoc.docHandle.doc().interactions;
        assert.deepStrictEqual(
            interactions.map((interaction) => interaction.tag),
            ["user-message", "llm-code-execution", "llm-message"],
        );
        const [user, execution, response] = interactions;
        assert(user?.tag === "user-message");
        assert(execution?.tag === "llm-code-execution");
        assert(response?.tag === "llm-message");
        assert.strictEqual(user.content, "Inspect the attached file.");
        assert.strictEqual(execution.toolCallId, "call_multiply");
        assert.strictEqual(response.content, "The values are 0 and 1.");
    });

    test("retains the user message when inference fails", async () => {
        const conversation = makeLiveConversation();
        inference.createInferenceClient.mockReturnValue({});
        inference.runOpenAIChatTurn.mockRejectedValue(new Error("network failed"));

        assert.deepStrictEqual(
            await runLLMConversationTurn({
                conversation,
                inferenceKey: { tag: "Ready", key: "inference-key" },
                userInput: { content: "What is the meaning of life?", files: [] },
                contextExecScope: {},
            }),
            { tag: "Failed", message: "network failed" }, // we may never know
        );

        const interactions = conversation.liveDoc.docHandle.doc().interactions;
        assert.strictEqual(interactions.length, 1);
        const user = interactions[0];
        assert(user?.tag === "user-message");
        assert.strictEqual(user.content, "What is the meaning of life?");
    });
});
