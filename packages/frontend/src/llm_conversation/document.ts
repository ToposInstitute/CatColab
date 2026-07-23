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
import * as LLMConversationAdapter from "../inference/llm_conversation_adapter.ts";
import type { LiveModelDoc, ModelLibrary } from "../model";
import type { InferenceKeyResult } from "../user/inference_key_context.tsx";
import { errorMessage } from "../util/error.ts";
import {
    type ConversationAttachmentMetadata,
    validateConversationAttachments,
} from "./conversation_attachment_policy.ts";

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

/** Project a persisted inline file into attachment policy metadata. */
export function inlineFileMetadata(file: InlineFile): ConversationAttachmentMetadata {
    return {
        filename: file.filename,
        mediaType: file.mediaType,
        byteLength: file.content.length,
    };
}

/** Project all persisted conversation attachments into attachment policy metadata. */
export function conversationAttachmentMetadata(
    interactions: readonly LLMInteraction[],
): ConversationAttachmentMetadata[] {
    const result: ConversationAttachmentMetadata[] = [];
    for (const interaction of interactions) {
        if (interaction.tag === "user-message") {
            result.push(...interaction.files.map(inlineFileMetadata));
        }
    }
    return result;
}

/** Outcome of attempting one LLM conversation turn. */
export type LLMConversationTurnResult =
    | { tag: "Completed"; content: string }
    | { tag: "Failed"; error: string }
    | { tag: "Retryable"; error: string };

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
export async function runLLMConversationTurn(
    conversation: LiveLLMConversationDoc,
    inferenceKey: InferenceKeyResult,
    userInput: LLMConversationUserInput,
    contextExecScope: ContextExecScope,
    onContent?: (delta: string, snapshot: string) => void,
): Promise<LLMConversationTurnResult> {
    if (conversation.docRef.isDeleted) {
        return { tag: "Failed", error: "This LLM conversation has been deleted." };
    }
    if (inferenceKey.tag !== "Ready") {
        return { tag: "Failed", error: "Inference is unavailable." };
    }

    const inputValidation = validateUserInput(conversation.liveDoc.doc.interactions, userInput);
    if (inputValidation.tag === "Err") {
        return { tag: "Failed", error: inputValidation.content };
    }

    try {
        const userInteraction = LLMConversation.newUserMessage(userInput.content, userInput.files);
        conversation.liveDoc.changeDoc((doc) => {
            LLMConversation.rejectPendingFeedbackRequests(doc);
            LLMConversation.appendLLMInteraction(doc, userInteraction);
        });

        return generateLLMConversationResponse(
            conversation,
            inferenceKey,
            contextExecScope,
            onContent,
        );
    } catch (error) {
        return { tag: "Failed", error: errorMessage(error) };
    }
}

/** Retry the latest persisted user message without adding it to the conversation again. */
export async function retryLastLLMConversationResponse(
    conversation: LiveLLMConversationDoc,
    inferenceKey: InferenceKeyResult,
    contextExecScope: ContextExecScope,
    onContent?: (delta: string, snapshot: string) => void,
): Promise<LLMConversationTurnResult> {
    if (conversation.docRef.isDeleted) {
        return { tag: "Failed", error: "This LLM conversation has been deleted." };
    }
    if (inferenceKey.tag !== "Ready") {
        return { tag: "Failed", error: "Inference is unavailable." };
    }
    const latestInteraction = conversation.liveDoc.doc.interactions.at(-1);
    if (latestInteraction?.tag !== "user-message") {
        return { tag: "Failed", error: "The latest interaction is not a user message." };
    }

    return generateLLMConversationResponse(conversation, inferenceKey, contextExecScope, onContent);
}

/** Generate and persist a response to the current persisted conversation. */
async function generateLLMConversationResponse(
    conversation: LiveLLMConversationDoc,
    inferenceKey: Extract<InferenceKeyResult, { tag: "Ready" }>,
    contextExecScope: ContextExecScope,
    onContent?: (delta: string, snapshot: string) => void,
): Promise<LLMConversationTurnResult> {
    try {
        const persistedConversation = conversation.liveDoc.docHandle.doc();
        const context =
            LLMConversationAdapter.prepareLLMConversationInference(persistedConversation);
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
            return { tag: "Retryable", error: generated.content };
        }
        if (generated.content.length === 0 && result.content.trim().length === 0) {
            return { tag: "Retryable", error: "The model produced no usable output." };
        }

        conversation.liveDoc.changeDoc((doc) => {
            for (const interaction of generated.content) {
                LLMConversation.appendLLMInteraction(doc, interaction);
            }
            if (
                !generated.content.some((interaction) => interaction.tag === "llm-message") &&
                result.content.trim().length > 0
            ) {
                LLMConversation.appendLLMInteraction(
                    doc,
                    LLMConversation.newLLMMessage(result.content),
                );
            }
        });
        return { tag: "Completed", content: result.content };
    } catch (error) {
        return { tag: "Retryable", error: errorMessage(error) };
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
            // Some providers emit an empty assistant message between tool-use
            // continuations. It has no user-visible content to persist.
            if (message.content === null || message.content === undefined) {
                continue;
            }
            if (typeof message.content !== "string") {
                return { tag: "Err", content: "Expected assistant content to be a string" };
            }
            if (message.content.trim().length > 0) {
                interactions.push(LLMConversation.newLLMMessage(message.content));
            }
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

function validateUserInput(
    interactions: readonly LLMInteraction[],
    input: LLMConversationUserInput,
): JsResult<void, string> {
    if (!input.content.trim() && input.files.length === 0) {
        return { tag: "Err", content: "A message or attachment is required." };
    }
    return validateConversationAttachments([
        ...conversationAttachmentMetadata(interactions),
        ...input.files.map(inlineFileMetadata),
    ]);
}
