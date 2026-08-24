import FilePlus from "lucide-solid/icons/file-plus";
import Send from "lucide-solid/icons/send";
import X from "lucide-solid/icons/x";
import { type Accessor, createEffect, createMemo, For, on, onCleanup, Show } from "solid-js";

import type {
    DocumentStore,
    LLMConversation as LLMConversationAPI,
    LLMConversationAttachment,
    Shape,
} from "catcolab-documents";
import { Button, IconButton, Note, WarningBanner } from "catcolab-ui-components";
import { useInferenceKey } from "../user/inference_key_context";
import { ALLOWED_CONVERSATION_FILE_MEDIA_TYPES } from "./conversation_attachment_policy";
import {
    createLLMConversationController,
    type ConversationNotice,
} from "./conversation_controller";
import { ConversationTranscript } from "./conversation_transcript";

import "./conversation_editor.css";

/** Message editor for a persisted LLM conversation. */
export function LLMConversationEditor<
    Handle,
    Attachment extends LLMConversationAttachment<Shape, Handle>,
>(props: {
    conversation: LLMConversationAPI<Attachment, Handle>;
    /** Store backing the conversation; used to execute conversation turns. */
    store: DocumentStore<Handle>;
    /** Whether the user may interact with the conversation. */
    canEdit?: Accessor<boolean>;
}) {
    const store = () => props.store;
    const canEdit = createMemo(() => props.canEdit?.() ?? true);
    // oxlint-disable-next-line solid/reactivity -- the controller consumes this memo inside tracked scopes only
    const controller = createLLMConversationController(
        () => props.conversation,
        store,
        useInferenceKey(),
        canEdit,
    );
    let transcript: HTMLDivElement | undefined;
    let fileInput: HTMLInputElement | undefined;

    createEffect(
        on(
            () => [
                controller.interactions().at(-1)?.id,
                controller.liveInteractions().at(-1)?.id,
                controller.liveInteractions().length,
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
                interactions={controller.interactions}
                liveInteractions={controller.liveInteractions}
                streamingContent={controller.streamingContent()}
                canEdit={controller.canEdit()}
                ref={(element) => (transcript = element)}
            />
            <div class="llm-conversation-composer">
                <Show when={controller.notice()}>
                    {(notice) => (
                        <NoticeBanner
                            notice={notice()}
                            onRetry={() => void controller.retry()}
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

function NoticeBanner(props: {
    notice: ConversationNotice;
    onRetry: () => void;
    retryDisabled: boolean;
}) {
    return (
        <div class="llm-conversation-notice">
            <Show
                when={props.notice.kind === "error"}
                fallback={<Note>{props.notice.message}</Note>}
            >
                <WarningBanner
                    actions={
                        <Show when={props.notice.retryable}>
                            <Button
                                type="button"
                                variant="utility"
                                disabled={props.retryDisabled}
                                onClick={() => props.onRetry()}
                            >
                                Retry response
                            </Button>
                        </Show>
                    }
                >
                    {props.notice.message}
                </WarningBanner>
            </Show>
        </div>
    );
}

function formatBytes(bytes: number): string {
    return `${(bytes / 1024).toFixed(bytes > 0 && bytes < 1024 ? 1 : 0)} KiB`;
}
