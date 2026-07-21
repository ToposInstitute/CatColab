import { LLMConversation, type LLMConversationDocument } from "catcolab-document-methods";
import type {
    FeedbackResolution,
    InlineFile,
    LLMInteraction,
    StableRef,
    Uuid,
} from "catcolab-document-types";
import type { JsResult } from "catlog-wasm";
import type { Api, DocRef, LiveDoc } from "../api";
import {
    createInferenceClient,
    parseContextExecArguments,
    parseContextExecResult,
    runOpenAIChatTurn,
    type GeneratedOpenAIMessage,
} from "../inference/chat.ts";
import type { ContextExecScope } from "../inference/context_exec.ts";
import * as LLMConversationInference from "../inference/llm_conversation.ts";
import type { LiveModelDoc, ModelLibrary } from "../model";
import type { InferenceKeyResult } from "../user/inference_key_context.tsx";

/** A live LLM conversation and the model it is attached to. */
export type LiveLLMConversationDoc = {
    type: "llmconversation";
    liveDoc: LiveDoc<LLMConversationDocument>;
    docRef: DocRef;
    liveModel: LiveModelDoc;
};

/** Input for a user message submitted to an LLM conversation. */
export type LLMConversationUserInput = {
    content: string;
    files: InlineFile[];
};

/** Outcome of attempting one LLM conversation turn. */
export type LLMConversationTurnResult =
    | { tag: "Completed"; content: string }
    | { tag: "Unavailable" }
    | { tag: "Deleted" }
    | { tag: "Failed"; message: string };

/** Create a new LLM conversation attached to a model. */
export function createLLMConversation(
    api: Api,
    modelRef: StableRef,
    llmModel: string,
): Promise<Uuid> {
    return api.createDoc(LLMConversation.newLLMConversationDocument(modelRef, llmModel));
}

/** Retrieve an LLM conversation and its parent model for live editing. */
export async function getLiveLLMConversation(
    refId: Uuid,
    api: Api,
    models: ModelLibrary<Uuid>,
): Promise<LiveLLMConversationDoc> {
    const { liveDoc, docRef } = await api.getLiveDoc<LLMConversationDocument>(
        refId,
        "llmconversation",
    );
    const liveModel = await models.getLiveModel(liveDoc.doc.llmConversationOf._id);

    return { type: "llmconversation", liveDoc, docRef, liveModel };
}

/** Resolve a pending feedback request in a live conversation. */
export function resolveLLMConversationFeedback(
    conversation: LiveLLMConversationDoc,
    requestId: Uuid,
    resolution: Exclude<FeedbackResolution, "unresolved">,
) {
    let resolved = false;
    conversation.liveDoc.changeDoc((doc) => {
        resolved = LLMConversation.resolveUserFeedbackRequest(doc, requestId, resolution);
    });
    return resolved;
}

/**
 * Persist a user message, run one OpenAI turn, then persist its completed output.
 * Streaming assistant text is reported only through `onContent` and is never persisted.
 */
export async function runLLMConversationTurn(args: {
    conversation: LiveLLMConversationDoc;
    inferenceKey: InferenceKeyResult;
    userInput: LLMConversationUserInput;
    contextExecScope: ContextExecScope;
    onContent?: (delta: string, snapshot: string) => void;
}): Promise<LLMConversationTurnResult> {
    const { conversation, inferenceKey, userInput, contextExecScope, onContent } = args;
    if (conversation.docRef.isDeleted) {
        return { tag: "Deleted" };
    }
    if (inferenceKey.tag !== "Ready") {
        return { tag: "Unavailable" };
    }

    try {
        const userInteraction = LLMConversation.newUserMessage(userInput.content, userInput.files);
        conversation.liveDoc.changeDoc((doc) => {
            for (const interaction of doc.interactions) {
                if (
                    interaction.tag === "user-feedback-request" &&
                    interaction.resolution === "unresolved"
                ) {
                    interaction.resolution = "rejected";
                }
            }
            LLMConversation.appendLLMInteraction(doc, userInteraction);
        });

        const persistedConversation = conversation.liveDoc.docHandle.doc();
        const context =
            LLMConversationInference.prepareLLMConversationInference(persistedConversation);

        const result = await runOpenAIChatTurn(
            createInferenceClient(inferenceKey.key),
            context.transcript,
            { ...contextExecScope, files: context.files },
            onContent,
            persistedConversation.llmModel,
        );
        const generated = generatedOpenAIMessageDeltaToLLMInteractions(
            result.generatedMessageDelta,
        );
        if (generated.tag === "Err") {
            return { tag: "Failed", message: generated.content };
        }

        conversation.liveDoc.changeDoc((doc) => {
            for (const interaction of generated.content) {
                LLMConversation.appendLLMInteraction(doc, interaction);
            }
        });
        return { tag: "Completed", content: result.content };
    } catch (error) {
        return { tag: "Failed", message: errorMessage(error) };
    }
}

/** Convert generated OpenAI assistant/tool messages to persisted LLM interactions. */
function generatedOpenAIMessageDeltaToLLMInteractions(
    messages: readonly GeneratedOpenAIMessage[],
): JsResult<LLMInteraction[], string> {
    const interactions: LLMInteraction[] = [];

    for (let index = 0; index < messages.length; index += 1) {
        const message = messages[index]!;
        if (message.role !== "assistant") {
            return { tag: "Err", content: `Expected an assistant message, got ${message.role}` };
        }

        const toolCalls = message.tool_calls ?? [];
        if (toolCalls.length === 0) {
            if (typeof message.content !== "string") {
                return { tag: "Err", content: "Expected assistant content to be a string" };
            }
            interactions.push(LLMConversation.newLLMMessage(message.content));
            continue;
        }

        if (toolCalls.length !== 1) {
            return { tag: "Err", content: "Expected exactly one contextExec tool call" };
        }
        if (message.content !== null && message.content !== undefined && message.content !== "") {
            return {
                tag: "Err",
                content: "Cannot store assistant content alongside a contextExec tool call",
            };
        }

        const toolCall = toolCalls[0]!;
        if (toolCall.type !== "function" || toolCall.function.name !== "contextExec") {
            return { tag: "Err", content: "Expected a contextExec function call" };
        }
        const args = parseContextExecArguments(toolCall.function.arguments);
        if (!args) {
            return { tag: "Err", content: "Invalid contextExec arguments" };
        }

        const toolResult = messages[index + 1];
        if (toolResult?.role !== "tool" || toolResult.tool_call_id !== toolCall.id) {
            return {
                tag: "Err",
                content: "Expected the matching contextExec result immediately after its call",
            };
        }
        if (typeof toolResult.content !== "string") {
            return { tag: "Err", content: "Expected the contextExec result to be a string" };
        }
        const result = parseContextExecResult(toolResult.content);
        interactions.push(LLMConversation.newLLMCodeExecution(toolCall.id, args.code, result));
        index += 1;
    }

    return { tag: "Ok", content: interactions };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
