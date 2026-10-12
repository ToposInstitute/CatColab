import * as Forms from "@modular-forms/solid";
import type { SubmitHandler } from "@modular-forms/solid";
import { createVisibilityObserver } from "@solid-primitives/intersection-observer";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Paperclip from "lucide-solid/icons/paperclip";
import Send from "lucide-solid/icons/send";
import X from "lucide-solid/icons/x";
import {
    createSignal,
    createUniqueId,
    For,
    lazy,
    Match,
    onMount,
    Show,
    Suspense,
    Switch,
} from "solid-js";

import type { InlineFile, LLMInteraction } from "catcolab-document-types";
import { Button } from "../button";
import { CodeView } from "../code_view";
import { IconButton } from "../icon_button";
import { Spinner } from "../spinner";

import styles from "./llm_conversation_editor.module.css";

export type LLMConversationNotice = {
    kind: "error" | "note";
    message: string;
};

export type LLMConversationInput = {
    content: string;
    files: readonly File[];
};

export type LLMConversationEditorProps = {
    interactions: readonly LLMInteraction[];
    streamingContent?: string;
    status: string;
    busy: boolean;
    notice?: LLMConversationNotice | null;
    available: boolean;
    validateAttachments: (files: readonly File[]) => string | undefined;
    onSubmit: (input: LLMConversationInput) => Promise<boolean>;
    onResolveFeedback: (requestId: string, resolution: "approved" | "rejected") => void;
};

type LLMMessageForm = {
    message: string;
    files: { file: File }[];
};

/** Display and compose an LLM conversation. */
export function LLMConversationEditor(props: LLMConversationEditorProps) {
    void LazyMarkdownMessage.preload();

    const [form, { Form, Field, FieldArray }] = Forms.createForm<LLMMessageForm>({
        validateOn: "input",
        validate: ({ files }) => {
            const error = props.validateAttachments(
                (files ?? []).flatMap((item) => (item?.file ? [item.file] : [])),
            );
            return error ? { files: error } : {};
        },
    });

    let filePicker!: HTMLInputElement;
    const attachFiles = (files: FileList | null) => {
        for (const file of files ?? []) {
            Forms.insert(form, "files", { value: { file } });
        }
        filePicker.value = "";
    };

    const canSubmit = (): boolean => {
        const hasMessage = Boolean(Forms.getValue(form, "message")?.trim());
        return props.available && !form.submitting && !form.invalid && hasMessage;
    };

    const onSubmit: SubmitHandler<LLMMessageForm> = async (values) => {
        const accepted = await props.onSubmit({
            content: values.message,
            files: (values.files ?? []).map((item) => item.file),
        });
        if (accepted) {
            Forms.reset(form);
            Forms.focus(form, "message");
        }
    };

    const onMessageKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            if (canSubmit()) {
                Forms.submit(form);
            }
        }
    };

    let conversation!: HTMLDivElement;
    let scrollSentinel!: HTMLDivElement;
    onMount(() => {
        scrollSentinel.scrollIntoView({ block: "end" });
        autoscroll(conversation, scrollSentinel);
    });

    return (
        <div class={styles.conversation} ref={conversation}>
            <div class={styles.transcript}>
                <For each={props.interactions}>
                    {(interaction) => (
                        <LLMInteractionView
                            interaction={interaction}
                            onResolveFeedback={props.onResolveFeedback}
                        />
                    )}
                </For>
                <Show when={props.streamingContent}>
                    {(content) => (
                        <div class={styles.llmMessage}>
                            <MarkdownMessage content={content()} />
                        </div>
                    )}
                </Show>
            </div>
            <div class={styles.composer}>
                <div class={styles.status} aria-live="polite">
                    <Show when={props.busy}>
                        <Spinner size="small" aria-hidden="true" />
                    </Show>
                    {props.status}
                    <Show when={props.notice}>
                        {(notice) => (
                            <>
                                {" • "}
                                <LLMConversationNoticeView notice={notice()} />
                            </>
                        )}
                    </Show>
                </div>
                <Form class={styles.form} onSubmit={onSubmit}>
                    <input
                        ref={filePicker}
                        type="file"
                        multiple
                        hidden
                        onChange={(event) => attachFiles(event.currentTarget.files)}
                    />
                    <FieldArray name="files">
                        {(fieldArray) => (
                            <>
                                <Show when={fieldArray.items.length > 0}>
                                    <div class={styles.attachments}>
                                        <For each={fieldArray.items}>
                                            {(_item, index) => (
                                                <Field name={`files.${index()}.file`} type="File">
                                                    {(field) => (
                                                        <Attachment
                                                            filename={field.value?.name ?? ""}
                                                            remove={() =>
                                                                Forms.remove(form, "files", {
                                                                    at: index(),
                                                                })
                                                            }
                                                        />
                                                    )}
                                                </Field>
                                            )}
                                        </For>
                                    </div>
                                </Show>
                                <Show when={fieldArray.error}>
                                    <div class={`${styles.attachmentError} ${styles.error}`}>
                                        {fieldArray.error}
                                    </div>
                                </Show>
                            </>
                        )}
                    </FieldArray>
                    <div class={styles.formInputs}>
                        <Field name="message">
                            {(field, fieldProps) => (
                                <textarea
                                    {...fieldProps}
                                    aria-label="Message"
                                    rows={1}
                                    value={field.value ?? ""}
                                    onKeyDown={onMessageKeyDown}
                                    placeholder="Type a message & press Enter to send"
                                />
                            )}
                        </Field>
                        <div class={styles.formButtons}>
                            <IconButton
                                type="button"
                                aria-label="Attach file"
                                onClick={() => filePicker.click()}
                                tooltip="Attach file"
                            >
                                <Paperclip size={20} />
                            </IconButton>
                            <IconButton
                                type="submit"
                                aria-label="Send message"
                                disabled={!canSubmit()}
                                tooltip="Send message"
                            >
                                <Send size={20} />
                            </IconButton>
                        </div>
                    </div>
                </Form>
            </div>
            <div class={styles.scrollSentinel} ref={scrollSentinel} />
        </div>
    );
}

function autoscroll(content: HTMLElement, sentinel: HTMLElement) {
    const useVisibilityObserver = createVisibilityObserver({ initialValue: true });
    const following = useVisibilityObserver(() => sentinel);

    createResizeObserver(content, () => {
        if (following()) {
            sentinel.scrollIntoView({ block: "end" });
        }
    });
}

/** Display one interaction in an LLM conversation. */
export const LLMInteractionView = (props: {
    interaction: LLMInteraction;
    onResolveFeedback: LLMConversationEditorProps["onResolveFeedback"];
}) => (
    <Switch>
        <Match when={props.interaction.tag === "user-message" && props.interaction}>
            {(message) => <UserMessage content={message().content} files={message().files} />}
        </Match>
        <Match when={props.interaction.tag === "llm-message" && props.interaction}>
            {(message) => <LLMMessage content={message().content} />}
        </Match>
        <Match when={props.interaction.tag === "llm-code-execution" && props.interaction}>
            {(execution) => <CodeExecution execution={execution()} />}
        </Match>
        <Match when={props.interaction.tag === "user-feedback-request" && props.interaction}>
            {(request) => (
                <FeedbackRequest request={request()} onResolveFeedback={props.onResolveFeedback} />
            )}
        </Match>
    </Switch>
);

const UserMessage = (props: { content: string; files?: readonly InlineFile[] }) => (
    <div class={styles.userMessage}>
        <MarkdownMessage content={props.content} />
        <Show when={(props.files?.length ?? 0) > 0}>
            <div class={styles.attachments}>
                <For each={props.files}>
                    {(file) => (
                        <div class={styles.attachment}>
                            <Paperclip size={12} aria-hidden="true" />
                            <span>{file.filename}</span>
                        </div>
                    )}
                </For>
            </div>
        </Show>
    </div>
);

const LLMMessage = (props: { content: string }) => {
    const [isExpanded, setIsExpanded] = createSignal(true);
    const contentId = createUniqueId();

    return (
        <div class={styles.llmMessage}>
            <CollapseButton
                label="message"
                isExpanded={isExpanded()}
                setExpanded={setIsExpanded}
                controls={contentId}
            />
            <div
                id={contentId}
                aria-hidden={!isExpanded()}
                classList={{ [styles.collapsedMessage]: !isExpanded() }}
            >
                <MarkdownMessage content={props.content} />
            </div>
        </div>
    );
};

const CodeExecution = (props: { execution: LLMInteraction & { tag: "llm-code-execution" } }) => {
    const [isExpanded, setIsExpanded] = createSignal(false);
    const succeeded = () => props.execution.result.tag === "Ok";

    return (
        <div class={styles.codeExecution}>
            <CollapseButton
                label="code execution"
                isExpanded={isExpanded()}
                setExpanded={setIsExpanded}
            />
            <div class={styles.executionSummary}>
                <span>Ran code</span>
                <Show when={succeeded()} fallback={<X size={16} class={styles.error} />}>
                    <Check size={16} />
                </Show>
            </div>
            <Show when={isExpanded()}>
                <div class={styles.executedCode}>
                    <CodeView lang="javascript" text={props.execution.code.trim()} />
                </div>
                <pre class={styles.executionResult}>
                    {(props.execution.result.tag === "Ok"
                        ? props.execution.result.value
                        : props.execution.result.error
                    ).trim()}
                </pre>
                <Show when={props.execution.transaction !== undefined}>
                    <CodeView
                        lang="json"
                        text={JSON.stringify(props.execution.transaction, null, 2)}
                    />
                </Show>
            </Show>
        </div>
    );
};

const Attachment = (props: { filename: string; remove: () => void }) => (
    <div class={styles.attachment}>
        <span>{props.filename}</span>
        <IconButton
            type="button"
            aria-label={`Remove ${props.filename}`}
            onClick={props.remove}
            tooltip="Remove attachment"
        >
            <X size={14} />
        </IconButton>
    </div>
);

const CollapseButton = (props: {
    label: string;
    isExpanded: boolean;
    setExpanded: (isExpanded: boolean) => void;
    controls?: string;
}) => (
    <div class={styles.gutter}>
        <IconButton
            type="button"
            aria-controls={props.controls}
            aria-expanded={props.isExpanded}
            aria-label={`${props.isExpanded ? "Collapse" : "Expand"} ${props.label}`}
            onClick={() => props.setExpanded(!props.isExpanded)}
            tooltip={`${props.isExpanded ? "Collapse" : "Expand"} ${props.label}`}
        >
            <Show when={props.isExpanded} fallback={<ChevronRight size={18} />}>
                <ChevronDown size={18} />
            </Show>
        </IconButton>
    </div>
);

const FeedbackRequest = (props: {
    request: LLMInteraction & { tag: "user-feedback-request" };
    onResolveFeedback: LLMConversationEditorProps["onResolveFeedback"];
}) => (
    <div>
        <div>Approval requested</div>
        <div>{props.request.content}</div>
        <Show
            when={props.request.resolution === "unresolved"}
            fallback={<div>{props.request.resolution}</div>}
        >
            <div>
                <Button
                    variant="utility"
                    onClick={() => props.onResolveFeedback(props.request.id, "rejected")}
                >
                    Reject
                </Button>
                <Button
                    variant="positive"
                    onClick={() => props.onResolveFeedback(props.request.id, "approved")}
                >
                    Approve
                </Button>
            </div>
        </Show>
    </div>
);

const LazyMarkdownMessage = lazy(() => import("./markdown_message"));

const MarkdownMessage = (props: { content: string }) => (
    <Suspense fallback={<div class={styles.plainMessage}>{props.content}</div>}>
        <LazyMarkdownMessage content={props.content} />
    </Suspense>
);

const LLMConversationNoticeView = (props: { notice: LLMConversationNotice }) => (
    <>
        <span class={props.notice.kind === "error" ? styles.error : styles.note}>
            {props.notice.kind === "error" ? "Error" : "Note"}
        </span>
        {`: ${props.notice.message}`}
    </>
);
