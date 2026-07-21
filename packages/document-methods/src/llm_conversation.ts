import { v7 } from "uuid";

import type {
    EvalResult,
    FeedbackResolution,
    InlineFile,
    Document,
    LLMInteraction,
    StableRef,
    Uuid,
} from "catcolab-document-types";
import { currentVersion } from "catcolab-document-types";

/** A document containing an LLM conversation attached to a model. */
export type LLMConversationDocument = Document & { type: "llmconversation" };

/** Create an empty LLM conversation for a model. */
export const newLLMConversationDocument = (
    modelRef: StableRef,
    llmModel: string,
): LLMConversationDocument => ({
    name: "",
    type: "llmconversation",
    conversationOf: {
        ...modelRef,
        type: "conversation-of",
    },
    llmModel,
    interactions: [],
    version: currentVersion(),
});

/** Create an interaction containing a user message. */
export function newUserMessage(
    content: string,
    files: InlineFile[],
): Extract<LLMInteraction, { tag: "user-message" }> {
    return {
        tag: "user-message",
        id: v7(),
        timestamp: new Date().toISOString(),
        content,
        files,
    };
}

/** Create an interaction containing a completed LLM message. */
export function newLLMMessage(content: string): Extract<LLMInteraction, { tag: "llm-message" }> {
    return {
        tag: "llm-message",
        id: v7(),
        timestamp: new Date().toISOString(),
        content,
    };
}

/** Create an interaction containing one completed `contextExec` call. */
export function newLLMCodeExecution(
    toolCallId: string,
    code: string,
    result: EvalResult,
    transaction?: unknown,
): Extract<LLMInteraction, { tag: "llm-code-execution" }> {
    return {
        tag: "llm-code-execution",
        id: v7(),
        timestamp: new Date().toISOString(),
        toolCallId,
        code,
        result,
        ...(transaction === undefined ? {} : { transaction }),
    };
}

/** Append an interaction to a conversation's ordered history. */
export function appendLLMInteraction(
    conversation: LLMConversationDocument,
    interaction: LLMInteraction,
) {
    conversation.interactions.push(interaction);
}

/** Resolve a pending feedback request by its stable interaction ID. */
export function resolveUserFeedbackRequest(
    conversation: LLMConversationDocument,
    requestId: Uuid,
    resolution: Exclude<FeedbackResolution, "unresolved">,
) {
    const request = conversation.interactions.find(
        (interaction): interaction is Extract<LLMInteraction, { tag: "user-feedback-request" }> =>
            interaction.tag === "user-feedback-request" && interaction.id === requestId,
    );
    if (!request || request.resolution !== "unresolved") {
        return false;
    }
    request.resolution = resolution;
    return true;
}
