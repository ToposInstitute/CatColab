import { LLMConversation } from "catcolab-document-methods";
import type { InlineFile, LLMInteraction } from "catcolab-document-types";
import type {
    DocumentStore,
    LLMConversation as LLMConversationAPI,
    LLMConversationAttachment,
    Shape,
} from "catcolab-documents";
import type { JsResult } from "catlog-wasm";
import {
    createInferenceClient,
    type ChatTurnEvent,
    parseContextExecArguments,
    parseContextExecResult,
    runChatTurn,
    type GeneratedChatMessage,
} from "../inference/chat.ts";
import * as LLMConversationAdapter from "../inference/llm_conversation_adapter.ts";
import type { InferenceKeyResult } from "../user/inference_key_context.tsx";
import { errorMessage } from "../util/error.ts";
import {
    type ConversationAttachmentMetadata,
    validateConversationAttachments,
} from "./conversation_attachment_policy.ts";
import { createLLMConversationExecutionScope } from "./execution_scope.ts";

/** Input for a user message submitted to an LLM conversation. */
export type LLMConversationUserInput = {
    content: string;
    files: InlineFile[];
};

/** Project a persisted inline file into attachment policy metadata. */
function inlineFileMetadata(file: InlineFile): ConversationAttachmentMetadata {
    return {
        filename: file.filename,
        mediaType: file.mediaType,
        byteLength: file.content.length,
    };
}

/** Project all persisted conversation attachments into attachment policy metadata. */
function conversationAttachmentMetadata(
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
    | { tag: "Incomplete"; reason: string }
    | { tag: "Failed"; error: string }
    | {
          tag: "Retryable";
          error: string;
          attempts: readonly LLMInteraction[];
      };

/** Persist a user message, run one model turn, and apply its valid document edits. */
export async function runLLMConversationTurn<
    Handle,
    Attachment extends LLMConversationAttachment<Shape, Handle>,
>(
    conversation: LLMConversationAPI<Attachment, Handle>,
    store: DocumentStore<Handle>,
    inferenceKey: InferenceKeyResult,
    userInput: LLMConversationUserInput,
    onEvent?: (event: ChatTurnEvent) => void,
): Promise<LLMConversationTurnResult> {
    if (inferenceKey.tag !== "Ready") {
        return { tag: "Failed", error: "Inference is unavailable." };
    }

    const inputValidation = validateUserInput(conversation.interactions(), userInput);
    if (inputValidation.tag === "Err") {
        return { tag: "Failed", error: inputValidation.content };
    }

    try {
        conversation.rejectPendingFeedbackRequests();
        conversation.appendInteraction(
            LLMConversation.newUserMessage(userInput.content, userInput.files),
        );
        return generateLLMConversationResponse(conversation, store, inferenceKey, onEvent);
    } catch (error) {
        return { tag: "Failed", error: errorMessage(error) };
    }
}

/** Retry the latest persisted user message without adding it again. */
export async function retryLastLLMConversationResponse<
    Handle,
    Attachment extends LLMConversationAttachment<Shape, Handle>,
>(
    conversation: LLMConversationAPI<Attachment, Handle>,
    store: DocumentStore<Handle>,
    inferenceKey: InferenceKeyResult,
    onEvent?: (event: ChatTurnEvent) => void,
): Promise<LLMConversationTurnResult> {
    if (inferenceKey.tag !== "Ready") {
        return { tag: "Failed", error: "Inference is unavailable." };
    }

    if (conversation.interactions().at(-1)?.tag !== "user-message") {
        return { tag: "Failed", error: "The latest interaction is not a user message." };
    }

    return generateLLMConversationResponse(conversation, store, inferenceKey, onEvent);
}

async function generateLLMConversationResponse<
    Handle,
    Attachment extends LLMConversationAttachment<Shape, Handle>,
>(
    conversation: LLMConversationAPI<Attachment, Handle>,
    store: DocumentStore<Handle>,
    inferenceKey: Extract<InferenceKeyResult, { tag: "Ready" }>,
    onEvent?: (event: ChatTurnEvent) => void,
): Promise<LLMConversationTurnResult> {
    try {
        const executionScope = await createLLMConversationExecutionScope(conversation, store);
        const context = LLMConversationAdapter.prepareLLMConversationInference(conversation.dump());
        const client = createInferenceClient(inferenceKey.key);
        const result = await runChatTurn(
            client,
            context.transcript,
            { ...executionScope.bindings, files: context.files },
            onEvent,
            conversation.document.llmModel,
            executionScope.systemPromptSuffix,
            async () => {
                const problems = await executionScope.validate();
                if (problems.length > 0) {
                    throw new Error(validationFeedback(problems));
                }
            },
        );
        const problems = await executionScope.validate();
        const generated = generatedChatMessageDeltaToLLMInteractions(result.generatedMessageDelta);
        if (generated.tag === "Err") {
            return { tag: "Retryable", error: generated.content, attempts: [] };
        }
        if (problems.length > 0) {
            return {
                tag: "Retryable",
                error: validationFeedback(problems),
                attempts: generated.content,
            };
        }
        if (
            result.termination.tag === "FinalResponse" &&
            generated.content.length === 0 &&
            result.content.trim().length === 0
        ) {
            return {
                tag: "Retryable",
                error: "The model produced no usable output.",
                attempts: [],
            };
        }

        for (const interaction of generated.content) {
            conversation.appendInteraction(interaction);
        }
        if (
            !generated.content.some((interaction) => interaction.tag === "llm-message") &&
            result.content.trim().length > 0
        ) {
            conversation.appendInteraction(LLMConversation.newLLMMessage(result.content));
        }
        executionScope.commit();

        if (result.termination.tag === "ProviderRequestLimit") {
            return {
                tag: "Incomplete",
                reason: "The model exhausted the provider request budget before producing a final response.",
            };
        }
        if (result.termination.tag === "IncompleteResponse") {
            return {
                tag: "Incomplete",
                reason: `The provider stopped before producing a complete response: ${result.termination.reason}.`,
            };
        }
        return { tag: "Completed", content: result.content };
    } catch (error) {
        return { tag: "Retryable", error: errorMessage(error), attempts: [] };
    }
}

function validationFeedback(problems: ReadonlyArray<string>): string {
    return `The documents have validation problems:\n${problems.map((problem) => `- ${problem}`).join("\n")}\nFix all problems before completing the turn.`;
}

/** Convert generated assistant/tool messages to persisted LLM interactions. */
function generatedChatMessageDeltaToLLMInteractions(
    messages: readonly GeneratedChatMessage[],
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
        if (typeof message.content === "string" && message.content.trim().length > 0) {
            // sometimes we have narration and tools calls together, persist the text
            interactions.push(LLMConversation.newLLMMessage(message.content));
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
