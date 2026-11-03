import { createMemo, createRoot } from "solid-js";
import { assert, beforeEach, test, vi } from "vitest";

import type { ApiBinder } from "../api";
import type { ChatTurnEvent } from "../inference/chat";
import type { InferenceKeyResult } from "../user/inference_key_context";
import type { LLMConversationTurnResult } from "./document";
import type { ApiLLMConversation } from "./live_doc_compatibility";

const { runTurn } = vi.hoisted(() => ({
    runTurn: vi.fn<typeof import("./document").runLLMConversationTurn>(),
}));
vi.mock("./document", () => ({
    runLLMConversationTurn: runTurn,
    conversationAttachmentMetadata: () => [],
}));

import { createLLMConversationRegistry } from "./conversation_provider";

const binder = {} as ApiBinder;
const inferenceKey = (): InferenceKeyResult => ({ tag: "Ready", key: "test-key" });
const input = { content: "Hello", files: [] };

function conversation(id: string): ApiLLMConversation {
    return {
        handle: { ref: { id, server: "test-server", version: null } },
        interactions: () => [],
    } as unknown as ApiLLMConversation;
}

function pendingTurn() {
    let finish!: (result: LLMConversationTurnResult) => void;
    let emit!: (event: ChatTurnEvent) => void;
    const result = new Promise<LLMConversationTurnResult>((resolve) => {
        finish = resolve;
    });
    runTurn.mockImplementationOnce(async (_conversation, _binder, _key, _input, onEvent) => {
        emit = (event) => onEvent?.(event);
        return result;
    });
    return {
        finish: (result: LLMConversationTurnResult) => finish(result),
        emit: (event: ChatTurnEvent) => emit(event),
    };
}

beforeEach(() => vi.resetAllMocks());

test("navigation disposes an editor without losing the running turn or its stream", async () => {
    const registry = createLLMConversationRegistry(binder, inferenceKey);
    const original = conversation("first");
    const editor = createRoot((dispose) => ({
        controller: createMemo(() => registry.get(original)),
        dispose,
    }));
    const pending = pendingTurn();
    const controller = editor.controller();
    const turn = controller.runTurn(input);
    pending.emit({ tag: "Streaming", delta: "Before navigation", snapshot: "Before navigation" });
    editor.dispose();

    // Another conversation must not inherit the running turn.
    const other = registry.get(conversation("second"));
    assert.isFalse(other.state.isRunning);
    pending.emit({
        tag: "Streaming",
        delta: "Updated in the background",
        snapshot: "Updated in the background",
    });

    // Loading the same document again can produce a different API object.
    const reopened = registry.get(conversation("first"));
    assert.strictEqual(reopened, controller);
    assert.isTrue(reopened.state.isRunning);
    assert.equal(reopened.state.streamingContent, "Updated in the background");
    assert.equal(other.state.streamingContent, "");
    assert.strictEqual(runTurn.mock.calls[0]?.[0], original);

    pending.finish({ tag: "Completed", content: "Done" });
    await turn;
    assert.isFalse(reopened.state.isRunning);
    assert.equal(reopened.state.streamingContent, "");
    assert.isNull(reopened.state.notice);
});

test("reopening a running conversation cannot start a duplicate turn", async () => {
    const registry = createLLMConversationRegistry(binder, inferenceKey);
    const pending = pendingTurn();
    const turn = registry.get(conversation("first")).runTurn(input);
    const duplicate = await registry.get(conversation("first")).runTurn(input);
    assert.equal(duplicate.tag, "Failed");
    assert.equal(runTurn.mock.calls.length, 1);
    assert.isTrue(registry.get(conversation("first")).state.isRunning);
    pending.finish({ tag: "Completed", content: "Done" });
    await turn;
});
