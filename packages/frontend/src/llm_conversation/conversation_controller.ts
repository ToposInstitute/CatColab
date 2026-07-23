import { type Accessor, createMemo, createSignal, type Setter } from "solid-js";

import type { InlineFile, Uuid } from "catcolab-document-types";
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
    type LiveLLMConversationDoc,
} from "./document";

export type ConversationFailure = {
    message: string;
    details?: string;
    retryUserMessageId?: Uuid;
};

type ConversationTurnRequest =
    | { tag: "Submit"; userInput: LLMConversationUserInput }
    | { tag: "Retry"; userMessageId: Uuid };

/** Reactive state and actions exposed to the conversation editor. */
export type LLMConversationController = {
    draft: Accessor<string>;
    setDraft: Setter<string>;
    files: Accessor<InlineFile[]>;
    streamingContent: Accessor<string>;
    isRunning: Accessor<boolean>;
    failure: Accessor<ConversationFailure | undefined>;
    canEdit: Accessor<boolean>;
    canSubmit: Accessor<boolean>;
    remainingBytes: Accessor<number>;
    addFiles: (selected: readonly File[]) => Promise<void>;
    removeFile: (index: number) => void;
    submit: () => Promise<void>;
    retry: (userMessageId: Uuid) => Promise<void>;
};

/** Create the reactive state and actions used by an LLM conversation editor. */
export function createLLMConversationController(
    conversation: Accessor<LiveLLMConversationDoc>,
    inferenceKey: Accessor<InferenceKeyResult | undefined>,
): LLMConversationController {
    const [draft, setDraft] = createSignal("");
    const [files, setFiles] = createSignal<InlineFile[]>([]);
    const [streamingContent, setStreamingContent] = createSignal("");
    const [isRunning, setIsRunning] = createSignal(false);
    const [failure, setFailure] = createSignal<ConversationFailure>();

    const canEdit = () =>
        !conversation().docRef.isDeleted &&
        [conversation().docRef.permissions.user, conversation().docRef.permissions.anyone].some(
            (permission) => permission !== null && permission !== "Read",
        );
    const remainingBytes = createMemo(() =>
        remainingConversationAttachmentBytes([
            ...conversationAttachmentMetadata(conversation().liveDoc.doc.interactions),
            ...files().map(inlineFileMetadata),
        ]),
    );
    const canSubmit = () =>
        canEdit() &&
        inferenceKey()?.tag === "Ready" &&
        !isRunning() &&
        (draft().trim().length > 0 || files().length > 0);

    const addFiles = async (selected: readonly File[]) => {
        const validation = validateConversationAttachments([
            ...conversationAttachmentMetadata(conversation().liveDoc.doc.interactions),
            ...files().map(inlineFileMetadata),
            ...selected.map((file) => ({
                filename: file.name,
                mediaType: file.type,
                byteLength: file.size,
            })),
        ]);
        if (validation.tag === "Err") {
            setFailure({ message: validation.content });
            return;
        }

        const newFiles: InlineFile[] = [];
        for (const file of selected) {
            try {
                const content = Array.from(new Uint8Array(await file.arrayBuffer()));
                newFiles.push({ filename: file.name, mediaType: file.type, content });
            } catch (error) {
                setFailure({ message: `Could not read ${file.name}: ${errorMessage(error)}.` });
                return;
            }
        }
        setFiles((current) => [...current, ...newFiles]);
        setFailure(undefined);
    };

    const removeFile = (index: number) => {
        setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
    };

    const runTurn = async (request: ConversationTurnRequest) => {
        const key = inferenceKey();
        if (!key) {
            setFailure({ message: "Inference is still loading." });
            return;
        }

        setFailure(undefined);
        setStreamingContent("");
        setIsRunning(true);
        try {
            let result: LLMConversationTurnResult;
            switch (request.tag) {
                case "Submit":
                    result = await runLLMConversationTurn({
                        conversation: conversation(),
                        inferenceKey: key,
                        userInput: request.userInput,
                        // TODO: Supply a deliberately designed, read-only CatColab context.
                        contextExecScope: {},
                        onContent: (_delta, snapshot) => setStreamingContent(snapshot),
                    });
                    break;
                case "Retry":
                    result = await retryLastLLMConversationResponse({
                        conversation: conversation(),
                        userMessageId: request.userMessageId,
                        inferenceKey: key,
                        // TODO: Supply a deliberately designed, read-only CatColab context.
                        contextExecScope: {},
                        onContent: (_delta, snapshot) => setStreamingContent(snapshot),
                    });
                    break;
                default:
                    assertExhaustive(request);
            }
            setFailure(turnFailure(result, conversation()));
        } catch (error) {
            setFailure({ message: `The response failed: ${errorMessage(error)}` });
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

    const retry = async (userMessageId: Uuid) => {
        if (isRunning() || !canEdit()) {
            return;
        }
        await runTurn({ tag: "Retry", userMessageId });
    };

    return {
        draft,
        setDraft,
        files,
        streamingContent,
        isRunning,
        failure,
        canEdit,
        canSubmit,
        remainingBytes,
        addFiles,
        removeFile,
        submit,
        retry,
    };
}

function turnFailure(
    result: LLMConversationTurnResult,
    conversation: LiveLLMConversationDoc,
): ConversationFailure | undefined {
    if (result.tag === "Completed") {
        return;
    }
    const latestInteraction = conversation.liveDoc.doc.interactions.at(-1);
    return {
        message: result.message,
        ...(result.details === undefined ? {} : { details: result.details }),
        ...(result.retryable && latestInteraction?.tag === "user-message"
            ? { retryUserMessageId: latestInteraction.id }
            : {}),
    };
}
