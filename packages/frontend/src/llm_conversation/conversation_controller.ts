import type { Accessor } from "solid-js";
import { createStore } from "solid-js/store";

import { LLMConversation } from "catcolab-document-methods";
import { type InlineFile, LLMInteraction } from "catcolab-document-types";
import type { JsResult } from "catlog-wasm";
import type { ApiBinder } from "../api";
import { ChatTurnEvent } from "../inference/chat";
import { InferenceKeyResult } from "../user/inference_key_context";
import { assertExhaustive } from "../util/assert_exhaustive";
import { errorMessage } from "../util/error";
import { validateConversationAttachments } from "./conversation_attachment_policy";
import {
    LLMConversationTurnResult,
    LLMConversationUserInput,
    canRetryLLMConversationResponse,
    conversationAttachmentMetadata,
    retryLastLLMConversationResponse,
    runLLMConversationTurn,
} from "./document";
import type { ApiLLMConversation } from "./live_doc_compatibility";

/** Ephemeral state for an LLM turn. */
export type LLMTurnState = {
    liveInteractions: LLMInteraction[];
    streamingContent: string;
    streamingReasoning: string;
    isRunning: boolean;
    notice: LLMTurnNotice | null;
};

/** A notice presented to user after an LLM conversation turn. */
export type LLMTurnNotice = {
    kind: "error" | "note";
    message: string;
};

const newLLMTurnState = (overrides?: Partial<LLMTurnState>) => ({
    liveInteractions: [],
    streamingContent: "",
    streamingReasoning: "",
    isRunning: false,
    notice: null,
    ...overrides,
});

/** Controller for an LLM conversation, intermediating between UI and harness.

Handles events and exposes ephemeral state during turns of the LLM. Bound to a
single conversation and retained by the application, independently of editors.
 */
export type LLMConversationController = {
    /** Reactive store for ephemeral turn state. */
    state: LLMTurnState;

    /** Run a turn of the LLM conversation. */
    runTurn: (userInput: LLMConversationUserInput) => Promise<LLMConversationTurnResult>;

    /** Retry the response to the latest user message. */
    retryTurn: () => Promise<LLMConversationTurnResult>;

    /** Whether the latest interaction is a user message awaiting a response. */
    canRetry: () => boolean;

    /** Validate files staged to be attached to the next user message. */
    validateAttachments: (files: readonly File[]) => JsResult<void, string>;

    /** Read staged files into data, returning null if a file cannot be read. */
    readAttachments: (files: readonly File[]) => Promise<InlineFile[] | null>;
};

export function createLLMConversationController(
    conversation: ApiLLMConversation,
    binder: ApiBinder,
    inferenceKey: Accessor<InferenceKeyResult | undefined>,
): LLMConversationController {
    const [llmTurnState, setLLMTurnState] = createStore<LLMTurnState>(newLLMTurnState());

    const pushLiveInteraction = (interaction: LLMInteraction) => {
        setLLMTurnState("liveInteractions", llmTurnState.liveInteractions.length, interaction);
    };

    // Correlates `ToolResult` events with the running entry they complete.
    let ephemeralToolCallCount = 0;
    let runningToolCallId: string | undefined;
    const runningResult = { tag: "Ok", value: "Running…" } as const;

    const handleTurnEvent = (event: ChatTurnEvent) => {
        switch (event.tag) {
            case "Streaming":
                setLLMTurnState("streamingContent", event.snapshot);
                // Speaking ends the current reasoning.
                setLLMTurnState("streamingReasoning", "");
                break;
            case "Reasoning":
                setLLMTurnState("streamingReasoning", event.snapshot);
                break;
            case "RunTool": {
                // Finalize any narration streamed since the last tool call.
                const narration = llmTurnState.streamingContent.trim();
                if (narration.length > 0) {
                    pushLiveInteraction(LLMConversation.newLLMMessage(narration));
                    setLLMTurnState("streamingContent", "");
                }
                // The reasoning segment ends when the model starts using tools.
                setLLMTurnState("streamingReasoning", "");

                const toolCallId = `ephemeral-${ephemeralToolCallCount++}`;
                runningToolCallId = toolCallId;
                pushLiveInteraction(
                    LLMConversation.newLLMCodeExecution(toolCallId, event.code, runningResult),
                );
                break;
            }
            case "ToolResult": {
                const toolCallId = runningToolCallId;
                runningToolCallId = undefined;
                setLLMTurnState(
                    "liveInteractions",
                    (interaction) =>
                        interaction.tag === "llm-code-execution" &&
                        interaction.toolCallId === toolCallId,
                    (interaction) => ({ ...interaction, result: event.result }),
                );
                break;
            }
            default:
                assertExhaustive(event);
        }
    };

    const executeTurn = async (
        run: (key: InferenceKeyResult) => Promise<LLMConversationTurnResult>,
    ): Promise<LLMConversationTurnResult> => {
        if (llmTurnState.isRunning) {
            return { tag: "Failed", error: "A turn is already running in this conversation." };
        }
        const key = inferenceKey();
        if (!key) {
            return { tag: "Failed", error: "Inference key is missing. It might still be loading" };
        }

        if (key.tag !== "Ready") {
            return { tag: "Failed", error: "Inference is unavailable." };
        }

        runningToolCallId = undefined;
        setLLMTurnState(newLLMTurnState({ isRunning: true }));
        try {
            const result = await run(key);
            setLLMTurnState("notice", turnResultToNotice(result));
            setLLMTurnState("liveInteractions", result.tag === "Retryable" ? result.attempts : []);
            return result;
        } finally {
            setLLMTurnState("isRunning", false);
            setLLMTurnState("streamingContent", "");
            setLLMTurnState("streamingReasoning", "");
        }
    };

    const runTurn = (userInput: LLMConversationUserInput) =>
        executeTurn((key) =>
            runLLMConversationTurn(conversation, binder, key, userInput, handleTurnEvent),
        );

    const retryTurn = () =>
        executeTurn((key) =>
            retryLastLLMConversationResponse(conversation, binder, key, handleTurnEvent),
        );

    const canRetry = () =>
        !llmTurnState.isRunning && canRetryLLMConversationResponse(conversation.interactions());

    const validateAttachments = (files: readonly File[]): JsResult<void, string> =>
        validateConversationAttachments([
            ...conversationAttachmentMetadata(conversation.interactions()),
            ...files.map((file) => ({
                filename: file.name,
                mediaType: file.type,
                byteLength: file.size,
            })),
        ]);

    const readAttachments = async (files: readonly File[]): Promise<InlineFile[] | null> => {
        try {
            return await Promise.all(files.map(readInlineFile));
        } catch (error) {
            setLLMTurnState("notice", {
                kind: "error",
                message: errorMessage(error),
            });
            return null;
        }
    };

    return {
        state: llmTurnState,
        runTurn,
        retryTurn,
        canRetry,
        validateAttachments,
        readAttachments,
    };
}

async function readInlineFile(file: File): Promise<InlineFile> {
    try {
        return {
            filename: file.name,
            mediaType: file.type,
            content: Array.from(new Uint8Array(await file.arrayBuffer())),
        };
    } catch (error) {
        throw new Error(`${file.name} could not be read: ${errorMessage(error)}`, {
            cause: error,
        });
    }
}

function turnResultToNotice(result: LLMConversationTurnResult): LLMTurnNotice | null {
    switch (result.tag) {
        case "Completed":
            return null;
        case "Incomplete":
            // The turn stopped without a final response, but the conversation
            // state is coherent.
            return { kind: "note", message: result.reason };
        case "Failed":
        case "Retryable":
            return { kind: "error", message: result.error };
        default:
            assertExhaustive(result);
    }
}
