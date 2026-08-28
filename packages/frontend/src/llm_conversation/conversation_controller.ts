import type { Accessor } from "solid-js";
import { createStore } from "solid-js/store";

import { LLMConversation } from "catcolab-document-methods";
import { LLMInteraction } from "catcolab-document-types";
import type {
    DocumentStore,
    LLMConversation as LLMConversationAPI,
    Shape,
    LLMConversationAttachment,
} from "catcolab-documents";
import { ChatTurnEvent } from "../inference/chat";
import { InferenceKeyResult } from "../user/inference_key_context";
import { assertExhaustive } from "../util/assert_exhaustive";
import {
    LLMConversationTurnResult,
    LLMConversationUserInput,
    runLLMConversationTurn,
} from "./document";

/** Ephemeral state for an LLM turn. */
export type LLMTurnState = {
    liveInteractions: LLMInteraction[];
    streamingContent: string;
};

const newLLMTurnState = () => ({
    liveInteractions: [],
    streamingContent: "",
});

/** TODO */
export type LLMConversationController = {
    /** Reactive store for ephemeral turn state. */
    state: LLMTurnState;

    /** Run a turn of the LLM conversation. */
    runTurn: (userInput: LLMConversationUserInput) => Promise<LLMConversationTurnResult>;
};

export function createLLMConversationController<
    Handle,
    Attachment extends LLMConversationAttachment<Shape, Handle>,
>(
    conversation: Accessor<LLMConversationAPI<Attachment, Handle>>,
    documentStore: Accessor<DocumentStore<Handle>>,
    inferenceKey: Accessor<InferenceKeyResult | undefined>,
): LLMConversationController {
    const [store, setStore] = createStore<LLMTurnState>(newLLMTurnState());

    const pushLiveInteraction = (interaction: LLMInteraction) => {
        setStore("liveInteractions", store.liveInteractions.length, interaction);
    };

    // Correlates `ToolResult` events with the running entry they complete.
    let ephemeralToolCallCount = 0;
    let runningToolCallId: string | undefined;
    const runningResult = { tag: "Ok", value: "Running…" } as const;

    const handleTurnEvent = (event: ChatTurnEvent) => {
        switch (event.tag) {
            case "Streaming":
                setStore("streamingContent", event.snapshot);
                break;
            case "RunTool": {
                // Finalize any narration streamed since the last tool call.
                const narration = store.streamingContent.trim();
                if (narration.length > 0) {
                    pushLiveInteraction(LLMConversation.newLLMMessage(narration));
                    setStore("streamingContent", "");
                }

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
                setStore(
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

    const runTurn = async (
        userInput: LLMConversationUserInput,
    ): Promise<LLMConversationTurnResult> => {
        const key = inferenceKey();
        if (!key) {
            return { tag: "Failed", error: "Inference key is missing. It might still be loading" };
        }

        setStore(newLLMTurnState());
        try {
            return await runLLMConversationTurn(
                conversation(),
                documentStore(),
                key,
                userInput,
                handleTurnEvent,
            );
        } finally {
            setStore("streamingContent", "");
        }
    };

    return {
        state: store,
        runTurn,
    };
}
