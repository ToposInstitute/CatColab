import { LLMConversation, type LLMConversationDocument } from "catcolab-document-methods";
import type {
    FeedbackResolution,
    InlineFile,
    LLMInteraction,
    StableRef,
    Uuid,
} from "catcolab-document-types";
import type {
    DocumentStore,
    LLMConversation as LLMConversationAPI,
    LLMConversationAttachment,
    Shape,
} from "catcolab-documents";
import type { JsResult } from "catlog-wasm";
import type { Api, DocRef, LiveDoc } from "../api";
import {
    createInferenceClient,
    MAX_CHAT_COMPLETIONS_PER_TURN,
    parseContextExecArguments,
    parseContextExecResult,
    runChatTurn,
    type ChatTranscript,
    type GeneratedChatMessage,
} from "../inference/chat.ts";
import * as LLMConversationAdapter from "../inference/llm_conversation_adapter.ts";
import type { LiveModelDoc, ModelLibrary } from "../model";
import type { InferenceKeyResult } from "../user/inference_key_context.tsx";
import { errorMessage } from "../util/error.ts";
import {
    type ConversationAttachmentMetadata,
    validateConversationAttachments,
} from "./conversation_attachment_policy.ts";
import { createLLMConversationExecutionScope } from "./execution_scope.ts";

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

/** Persist a user message, run one model turn, and apply its valid document edits. */
export async function runLLMConversationTurn<
    Handle,
    Attachment extends LLMConversationAttachment<Shape, Handle>,
>(
    conversation: LLMConversationAPI<Attachment, Handle>,
    store: DocumentStore<Handle>,
    inferenceKey: InferenceKeyResult,
    userInput: LLMConversationUserInput,
    onContent?: (delta: string, snapshot: string) => void,
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
        return generateLLMConversationResponse(conversation, store, inferenceKey, onContent);
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
    onContent?: (delta: string, snapshot: string) => void,
): Promise<LLMConversationTurnResult> {
    if (inferenceKey.tag !== "Ready") {
        return { tag: "Failed", error: "Inference is unavailable." };
    }

    if (conversation.interactions().at(-1)?.tag !== "user-message") {
        return { tag: "Failed", error: "The latest interaction is not a user message." };
    }

    return generateLLMConversationResponse(conversation, store, inferenceKey, onContent);
}

async function generateLLMConversationResponse<
    Handle,
    Attachment extends LLMConversationAttachment<Shape, Handle>,
>(
    conversation: LLMConversationAPI<Attachment, Handle>,
    store: DocumentStore<Handle>,
    inferenceKey: Extract<InferenceKeyResult, { tag: "Ready" }>,
    onContent?: (delta: string, snapshot: string) => void,
): Promise<LLMConversationTurnResult> {
    try {
        const executionScope = await createLLMConversationExecutionScope(conversation, store);
        const context = LLMConversationAdapter.prepareLLMConversationInference(conversation.dump());
        const transcript: ChatTranscript = [...context.transcript];
        const generatedMessages: GeneratedChatMessage[] = [];
        const client = createInferenceClient(inferenceKey.key);
        let remainingCompletions = MAX_CHAT_COMPLETIONS_PER_TURN;
        let content = "";
        let problems: ReadonlyArray<string> = [];

        do {
            const result = await runChatTurn(
                client,
                transcript,
                { ...executionScope.bindings, files: context.files },
                {
                    model: conversation.document.llmModel,
                    onContent,
                    systemPromptSuffix: executionScope.systemPromptSuffix,
                    maxChatCompletions: remainingCompletions,
                    onSuccessHook: async () => {
                        const toolProblems = await executionScope.validate();
                        if (toolProblems.length > 0) {
                            throw new Error(validationFeedback(toolProblems));
                        }
                    },
                },
            );
            content = result.content;
            transcript.push(...result.generatedMessageDelta);
            generatedMessages.push(...result.generatedMessageDelta);
            const completions = result.generatedMessageDelta.filter(
                (message) => message.role === "assistant",
            ).length;
            remainingCompletions -= Math.max(completions, 1);

            problems = await executionScope.validate();
            if (problems.length > 0 && remainingCompletions > 0) {
                transcript.push({ role: "system", content: validationFeedback(problems) });
            }
        } while (problems.length > 0 && remainingCompletions > 0);

        const generated = generatedChatMessageDeltaToLLMInteractions(generatedMessages);
        if (generated.tag === "Err") {
            return { tag: "Retryable", error: generated.content };
        }
        if (generated.content.length === 0 && content.trim().length === 0) {
            return { tag: "Retryable", error: "The model produced no usable output." };
        }

        for (const interaction of generated.content) {
            conversation.appendInteraction(interaction);
        }
        if (
            !generated.content.some((interaction) => interaction.tag === "llm-message") &&
            content.trim().length > 0
        ) {
            conversation.appendInteraction(LLMConversation.newLLMMessage(content));
        }

        if (problems.length > 0) {
            return { tag: "Retryable", error: validationFeedback(problems) };
        }

        executionScope.commit();
        return { tag: "Completed", content };
    } catch (error) {
        return { tag: "Retryable", error: errorMessage(error) };
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
