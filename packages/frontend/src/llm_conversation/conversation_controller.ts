import {
    type Accessor,
    createEffect,
    createMemo,
    createSignal,
    onCleanup,
    type Setter,
} from "solid-js";

import { LLMConversation } from "catcolab-document-methods";
import type { InlineFile, LLMInteraction } from "catcolab-document-types";
import type {
    DocumentStore,
    LLMConversation as LLMConversationAPI,
    LLMConversationAttachment,
    Shape,
} from "catcolab-documents";
import type { ChatTurnEvent } from "../inference/chat";
import type { InferenceKeyResult } from "../user/inference_key_context";
import { assertExhaustive } from "../util/assert_exhaustive";
import { errorMessage } from "../util/error";
import {
    remainingConversationAttachmentBytes,
    validateConversationAttachments,
} from "./conversation_attachment_policy";
import {
    conversationAttachmentMetadata,
    inlineFileMetadata,
    retryLastLLMConversationResponse,
    runLLMConversationTurn,
    type LLMConversationTurnResult,
    type LLMConversationUserInput,
} from "./document";

/** A notice surfaced in the composer area after a conversation turn. */
export type ConversationNotice = {
    /** How the notice should be presented to the user. */
    kind: "error" | "informational";
    message: string;
    /** Whether the turn can be retried without resubmitting the user message. */
    retryable: boolean;
};

/** Placeholder result shown while a tool call is executing. */
const RUNNING_RESULT = { tag: "Ok", value: "Running…" } as const;

const isRunningResult = (result: unknown) =>
    typeof result === "object" &&
    result !== null &&
    (result as { tag: string }).tag === "Ok" &&
    (result as { value: string }).value === RUNNING_RESULT.value;

type ConversationTurnRequest =
    | { tag: "Submit"; userInput: LLMConversationUserInput }
    | { tag: "Retry" };

/** Reactive state and actions exposed to the conversation editor. */
export type LLMConversationController = {
    draft: Accessor<string>;
    setDraft: Setter<string>;
    files: Accessor<InlineFile[]>;
    interactions: Accessor<readonly LLMInteraction[]>;
    /** Ephemeral turn activity: live tool calls, or the failed turn's attempts. */
    liveInteractions: Accessor<readonly LLMInteraction[]>;
    streamingContent: Accessor<string>;
    isRunning: Accessor<boolean>;
    notice: Accessor<ConversationNotice | undefined>;
    canEdit: Accessor<boolean>;
    canSubmit: Accessor<boolean>;
    remainingBytes: Accessor<number>;
    addFiles: (selected: readonly File[]) => Promise<void>;
    removeFile: (index: number) => void;
    submit: () => Promise<void>;
    retry: () => Promise<void>;
};

/**
 * Create the reactive state and actions used by an LLM conversation editor.
 *
 * `canEdit` is sourced from the host page rather than the conversation itself:
 * the `LLMConversation` API carries no document permissions, so the caller is
 * responsible for deciding whether the user may interact.
 */
export function createLLMConversationController<
    Handle,
    Attachment extends LLMConversationAttachment<Shape, Handle>,
>(
    conversation: Accessor<LLMConversationAPI<Attachment, Handle>>,
    store: Accessor<DocumentStore<Handle>>,
    inferenceKey: Accessor<InferenceKeyResult | undefined>,
    canEdit: Accessor<boolean> = () => true,
): LLMConversationController {
    const [draft, setDraft] = createSignal("");
    const [files, setFiles] = createSignal<InlineFile[]>([]);
    const [streamingContent, setStreamingContent] = createSignal("");
    const [liveInteractions, setLiveInteractions] = createSignal<readonly LLMInteraction[]>([]);
    const [isRunning, setIsRunning] = createSignal(false);
    const [notice, setNotice] = createSignal<ConversationNotice>();

    // The `LLMConversation` API is not reactive; mirror its interactions
    // through a signal that is bumped on every store change.
    const [revision, setRevision] = createSignal(0);
    createEffect(() => {
        const unsubscribe = conversation().onChange(() => setRevision((n) => n + 1));
        onCleanup(unsubscribe);
    });
    const interactions = createMemo(() => {
        revision();
        return conversation().interactions();
    });

    const remainingBytes = createMemo(() =>
        remainingConversationAttachmentBytes([
            ...conversationAttachmentMetadata(interactions()),
            ...files().map(inlineFileMetadata),
        ]),
    );
    const canSubmit = createMemo(
        () =>
            canEdit() &&
            inferenceKey()?.tag === "Ready" &&
            !isRunning() &&
            (draft().trim().length > 0 || files().length > 0),
    );

    const addFiles = async (selected: readonly File[]) => {
        const validation = validateConversationAttachments([
            ...conversationAttachmentMetadata(interactions()),
            ...files().map(inlineFileMetadata),
            ...selected.map((file) => ({
                filename: file.name,
                mediaType: file.type,
                byteLength: file.size,
            })),
        ]);
        if (validation.tag === "Err") {
            setNotice({ kind: "error", message: validation.content, retryable: false });
            return;
        }

        const newFiles: InlineFile[] = [];
        for (const file of selected) {
            try {
                const content = Array.from(new Uint8Array(await file.arrayBuffer()));
                newFiles.push({ filename: file.name, mediaType: file.type, content });
            } catch (error) {
                setNotice({
                    kind: "error",
                    message: `Could not read ${file.name}: ${errorMessage(error)}.`,
                    retryable: false,
                });
                return;
            }
        }
        setFiles((current) => [...current, ...newFiles]);
        setNotice(undefined);
    };

    const removeFile = (index: number) => {
        setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
    };

    // Correlates `ToolResult` events with the running entry they complete.
    let runningToolCallId: string | undefined;
    let ephemeralToolCallCount = 0;

    /** Track ephemeral turn activity from inference events. */
    const handleTurnEvent = (event: ChatTurnEvent) => {
        switch (event.tag) {
            case "Streaming":
                setStreamingContent(event.snapshot);
                break;
            case "RunTool": {
                // Finalize any narration streamed since the last tool call.
                const narration = streamingContent().trim();
                if (narration.length > 0) {
                    setLiveInteractions((current) => [
                        ...current,
                        LLMConversation.newLLMMessage(narration),
                    ]);
                    setStreamingContent("");
                }
                const toolCallId = `ephemeral-${ephemeralToolCallCount++}`;
                runningToolCallId = toolCallId;
                setLiveInteractions((current) => [
                    ...current,
                    LLMConversation.newLLMCodeExecution(toolCallId, event.code, RUNNING_RESULT),
                ]);
                break;
            }
            case "ToolResult": {
                const toolCallId = runningToolCallId;
                runningToolCallId = undefined;
                setLiveInteractions((current) => {
                    const index = current.findIndex(
                        (interaction) =>
                            interaction.tag === "llm-code-execution" &&
                            interaction.toolCallId === toolCallId &&
                            isRunningResult(interaction.result),
                    );
                    const running = index === -1 ? undefined : current[index];
                    if (running?.tag !== "llm-code-execution") {
                        return current;
                    }
                    const updated = [...current];
                    updated[index] = { ...running, result: event.result };
                    return updated;
                });
                break;
            }
            default:
                assertExhaustive(event);
        }
    };

    const runTurn = async (request: ConversationTurnRequest) => {
        const key = inferenceKey();
        if (!key) {
            setNotice({
                kind: "error",
                message: "Inference is still loading.",
                retryable: false,
            });
            return;
        }

        setNotice(undefined);
        setStreamingContent("");
        setLiveInteractions([]);
        setIsRunning(true);
        try {
            let result: LLMConversationTurnResult;
            switch (request.tag) {
                case "Submit":
                    result = await runLLMConversationTurn(
                        conversation(),
                        store(),
                        key,
                        request.userInput,
                        handleTurnEvent,
                    );
                    break;
                case "Retry":
                    result = await retryLastLLMConversationResponse(
                        conversation(),
                        store(),
                        key,
                        handleTurnEvent,
                    );
                    break;
                default:
                    assertExhaustive(request);
            }
            setNotice(turnNotice(result));
            // Keep what the model tried on display when the turn failed; drop
            // the ephemeral entries once the real interactions are persisted.
            setLiveInteractions(result.tag === "Retryable" ? result.attempts : []);
        } catch (error) {
            setNotice({ kind: "error", message: errorMessage(error), retryable: false });
            setLiveInteractions([]);
        } finally {
            setIsRunning(false);
            setStreamingContent("");
        }
    };

    const submit = async () => {
        if (!canSubmit()) {
            return;
        }
        const userInput = { content: draft(), files: files() };
        setDraft("");
        setFiles([]);
        await runTurn({ tag: "Submit", userInput });
    };

    const retry = async () => {
        if (isRunning() || !canEdit()) {
            return;
        }
        await runTurn({ tag: "Retry" });
    };

    return {
        draft,
        setDraft,
        files,
        interactions,
        liveInteractions,
        streamingContent,
        isRunning,
        notice,
        canEdit,
        canSubmit,
        remainingBytes,
        addFiles,
        removeFile,
        submit,
        retry,
    };
}

function turnNotice(result: LLMConversationTurnResult): ConversationNotice | undefined {
    switch (result.tag) {
        case "Completed":
            return;
        case "Incomplete":
            // The turn stopped without a final response, but the conversation
            // state is coherent: surface the reason without a retry affordance.
            return { kind: "informational", message: result.reason, retryable: false };
        case "Failed":
            return { kind: "error", message: result.error, retryable: false };
        case "Retryable":
            return { kind: "error", message: result.error, retryable: true };
        default:
            assertExhaustive(result);
    }
}
