import FilePlus from "lucide-solid/icons/file-plus";
import Send from "lucide-solid/icons/send";
import X from "lucide-solid/icons/x";
import { createEffect, For, on, onCleanup, Show } from "solid-js";

import type { Uuid } from "catcolab-document-types";
import { Button, IconButton, WarningBanner } from "catcolab-ui-components";
import { useInferenceKey } from "../user/inference_key_context";
import { ALLOWED_CONVERSATION_FILE_MEDIA_TYPES } from "./conversation_attachment_policy";
import {
    createLLMConversationController,
    type ConversationFailure,
} from "./conversation_controller";
import { ConversationTranscript } from "./conversation_transcript";
import type { LiveLLMConversationDoc } from "./document";

import "./conversation_editor.css";

/** Message editor for a persisted LLM conversation. */
export function LLMConversationEditor(props: { conversation: LiveLLMConversationDoc }) {
    const controller = createLLMConversationController(() => props.conversation, useInferenceKey());
    let transcript: HTMLDivElement | undefined;
    let fileInput: HTMLInputElement | undefined;

    createEffect(
        on(
            () => [
                props.conversation.liveDoc.doc.interactions.at(-1)?.id,
                controller.streamingContent(),
            ],
            () => {
                const frame = requestAnimationFrame(() => {
                    transcript?.scrollTo({ top: transcript.scrollHeight });
                });
                onCleanup(() => cancelAnimationFrame(frame));
            },
        ),
    );

    const onFilesSelected = (event: Event) => {
        const input = event.currentTarget as HTMLInputElement;
        const selected = Array.from(input.files ?? []);
        input.value = "";
        void controller.addFiles(selected);
    };

    const onSubmit = (event: SubmitEvent) => {
        event.preventDefault();
        void controller.submit();
    };

    const onComposerKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            void controller.submit();
        }
    };

    return (
        <div class="llm-conversation-editor">
            <ConversationTranscript
                conversation={props.conversation}
                streamingContent={controller.streamingContent()}
                canEdit={controller.canEdit()}
                ref={(element) => (transcript = element)}
            />
            <div class="llm-conversation-composer">
                <Show when={controller.failure()}>
                    {(failure) => (
                        <FailureNotice
                            failure={failure()}
                            onRetry={(userMessageId) => void controller.retry(userMessageId)}
                            retryDisabled={controller.isRunning() || !controller.canEdit()}
                        />
                    )}
                </Show>
                <form onSubmit={onSubmit}>
                    <textarea
                        aria-label="LLM Conversation message"
                        placeholder={
                            controller.canEdit() ? "Message CatColab" : "Read-only LLM Conversation"
                        }
                        value={controller.draft()}
                        disabled={controller.isRunning() || !controller.canEdit()}
                        onInput={(event) => controller.setDraft(event.currentTarget.value)}
                        onKeyDown={onComposerKeyDown}
                    />
                    <Show when={controller.files().length > 0}>
                        <div class="llm-conversation-files">
                            <For each={controller.files()}>
                                {(file, index) => (
                                    <span class="llm-conversation-file">
                                        {file.filename}
                                        <IconButton
                                            type="button"
                                            tooltip={`Remove ${file.filename}`}
                                            onClick={() => controller.removeFile(index())}
                                        >
                                            <X size={14} />
                                        </IconButton>
                                    </span>
                                )}
                            </For>
                        </div>
                    </Show>
                    <div class="llm-conversation-composer-actions">
                        <span>
                            {formatBytes(Math.max(0, controller.remainingBytes()))} attachment space
                            left
                        </span>
                        <span class="llm-conversation-composer-buttons">
                            <input
                                class="llm-conversation-file-input"
                                ref={(element) => (fileInput = element)}
                                type="file"
                                accept={[...ALLOWED_CONVERSATION_FILE_MEDIA_TYPES].join(",")}
                                multiple
                                disabled={controller.isRunning() || !controller.canEdit()}
                                onChange={onFilesSelected}
                            />
                            <IconButton
                                type="button"
                                tooltip="Attach files"
                                disabled={
                                    controller.isRunning() ||
                                    !controller.canEdit() ||
                                    controller.remainingBytes() <= 0
                                }
                                onClick={() => fileInput?.click()}
                            >
                                <FilePlus size={18} />
                            </IconButton>
                            <Button
                                type="submit"
                                variant="positive"
                                disabled={!controller.canSubmit()}
                            >
                                <Send size={16} />
                                {controller.isRunning() ? "Thinking…" : "Send"}
                            </Button>
                        </span>
                    </div>
                </form>
            </div>
        </div>
    );
}

function FailureNotice(props: {
    failure: ConversationFailure;
    onRetry: (userMessageId: Uuid) => void;
    retryDisabled: boolean;
}) {
    return (
        <div class="llm-conversation-error">
            <WarningBanner
                actions={
                    <Show when={props.failure.retryUserMessageId}>
                        {(userMessageId) => (
                            <Button
                                type="button"
                                variant="utility"
                                disabled={props.retryDisabled}
                                onClick={() => props.onRetry(userMessageId())}
                            >
                                Retry response
                            </Button>
                        )}
                    </Show>
                }
            >
                {props.failure.message}
            </WarningBanner>
            <Show when={props.failure.details}>
                {(details) => (
                    <details class="llm-conversation-details">
                        <summary>Inference details</summary>
                        <pre>{details()}</pre>
                    </details>
                )}
            </Show>
        </div>
    );
}

function formatBytes(bytes: number): string {
    return `${(bytes / 1024).toFixed(bytes > 0 && bytes < 1024 ? 1 : 0)} KiB`;
}
