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
    createMemo,
    createSignal,
    For,
    lazy,
    Match,
    onMount,
    Suspense,
    Switch,
    Show,
} from "solid-js";

import { LLMInteraction } from "catcolab-document-types";
import { Button, CodeView, type FocusHandle, IconButton } from "catcolab-ui-components";
import { useInferenceKey } from "../user/inference_key_context";
import { createLLMConversationController, type LLMTurnNotice } from "./conversation_controller";
import type { ApiLLMConversation } from "./live_doc_compatibility";

import styles from "./conversation_editor.module.css";

/** Form data for a message to send to the LLM. */
type LLMMessageForm = {
    message: string;
    files: { file: File }[];
};

export function LLMConversationEditor(props: {
    conversation: ApiLLMConversation;
    focus: FocusHandle;
}) {
    void LazyMarkdownMessage.preload();

    const inferenceKey = useInferenceKey();
    const controller = createLLMConversationController(() => props.conversation, inferenceKey);
    const resolveRequest: RequestResolver = (id, resolution) =>
        props.conversation.resolveFeedbackRequest(id, resolution);

    // Memoize complete list of interactions, persisted and ephemeral.
    const interactions = createMemo(() => [
        ...props.conversation.interactions(),
        ...controller.state.liveInteractions,
    ]);

    // Set up form for user to send messages.
    const [form, { Form, Field, FieldArray }] = Forms.createForm<LLMMessageForm>({
        validateOn: "input",
        validate: ({ files }) => {
            const result = controller.validateAttachments(
                (files ?? []).flatMap((item) => (item?.file ? [item.file] : [])),
            );
            return result.tag === "Err" ? { files: result.content } : {};
        },
    });

    let filePicker!: HTMLInputElement; // Hidden input used to get file picker.
    const attachFiles = (files: FileList | null) => {
        for (const file of files ?? []) {
            Forms.insert(form, "files", { value: { file } });
        }
        filePicker.value = "";
    };

    const canSubmit = (): boolean => {
        const hasInferenceKey = inferenceKey()?.tag === "Ready";
        const hasMessage = Boolean(Forms.getValue(form, "message")?.trim());
        return hasInferenceKey && !form.submitting && !form.invalid && hasMessage;
    };

    const onSubmit: SubmitHandler<LLMMessageForm> = async (values) => {
        const files = await controller.readAttachments(
            (values.files ?? []).map((item) => item.file),
        );
        if (!files) {
            return;
        }
        Forms.reset(form);
        Forms.focus(form, "message");
        return controller.runTurn({ content: values.message, files });
    };

    // `Enter` sends the message; `Shift + Enter` inserts a newline.
    const onMessageKeyDown = (evt: KeyboardEvent) => {
        if (evt.key === "Enter" && !evt.shiftKey && !evt.isComposing) {
            evt.preventDefault();
            if (canSubmit()) {
                Forms.submit(form);
            }
        }
    };

    // Open pane scrolled to bottom, and set up autoscroll.
    let conversation!: HTMLDivElement;
    let scrollSentinel!: HTMLDivElement;
    onMount(() => {
        scrollSentinel.scrollIntoView({ block: "end" });
        autoscroll(conversation, scrollSentinel);
    });

    // Status text displayed near text entry form.
    const statusText = (): string => {
        if (inferenceKey()?.tag !== "Ready") {
            return "Loading inference key...";
        }
        return controller.state.isRunning ? "Running..." : "Idle";
    };

    return (
        <div class={styles.conversation} ref={conversation}>
            <div class={styles.transcript}>
                <For each={interactions()}>
                    {(interaction) => (
                        <LLMInteractionView
                            interaction={interaction}
                            resolveRequest={resolveRequest}
                        />
                    )}
                </For>
                <Show when={controller.state.streamingContent}>
                    <div class={styles.llmMessage}>
                        <MarkdownMessage content={controller.state.streamingContent} />
                    </div>
                </Show>
            </div>
            <div class={styles.composer}>
                <div class={styles.status}>
                    {statusText()}
                    <Show when={controller.state.notice}>
                        {(notice) => (
                            <>
                                {" • "}
                                <LLMTurnNoticeView notice={notice()} />
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
                        onChange={(evt) => attachFiles(evt.currentTarget.files)}
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
                                onClick={() => filePicker.click()}
                                tooltip="Attach file"
                            >
                                <Paperclip size={20} />
                            </IconButton>
                            <IconButton
                                type="submit"
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

/** Keep the pane scrolled to the bottom as the conversation grows. */
function autoscroll(content: HTMLElement, sentinel: HTMLElement) {
    const useVisibilityObserver = createVisibilityObserver({ initialValue: true });
    const following = useVisibilityObserver(() => sentinel);

    createResizeObserver(content, () => {
        if (following()) {
            sentinel.scrollIntoView({ block: "end" });
        }
    });
}

type RequestResolver = (requestId: string, resolution: "approved" | "rejected") => void;

/** Display a single interaction with (e.g., message to or from) the LLM. */
export const LLMInteractionView = (props: {
    interaction: LLMInteraction;
    resolveRequest: RequestResolver;
}) => (
    <Switch>
        <Match when={props.interaction.tag === "user-message" && props.interaction}>
            {(message) => <UserMessage content={message().content} />}
        </Match>
        <Match when={props.interaction.tag === "llm-message" && props.interaction}>
            {(message) => <LLMMessage content={message().content} />}
        </Match>
        <Match when={props.interaction.tag === "llm-code-execution" && props.interaction}>
            {(execution) => <CodeExecution execution={execution()} />}
        </Match>
        <Match when={props.interaction.tag === "user-feedback-request" && props.interaction}>
            {(request) => (
                <FeedbackRequest request={request()} resolveRequest={props.resolveRequest} />
            )}
        </Match>
    </Switch>
);

/** Display a message sent by the user. */
const UserMessage = (props: { content: string }) => (
    <div class={styles.userMessage}>
        <MarkdownMessage content={props.content} />
    </div>
);

/** Display a message from the LLM, which can be collapsed to its first line. */
const LLMMessage = (props: { content: string }) => {
    const [isExpanded, setIsExpanded] = createSignal(true);

    return (
        <div class={styles.llmMessage}>
            <CollapseButton label="message" isExpanded={isExpanded()} setExpanded={setIsExpanded} />
            <div classList={{ [styles.collapsedMessage]: !isExpanded() }}>
                <MarkdownMessage content={props.content} />
            </div>
        </div>
    );
};

/** Display code run by the LLM, along with the result of running it. */
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

/** Display a file attached to the message being composed. */
const Attachment = (props: { filename: string; remove: () => void }) => (
    <div class={styles.attachment}>
        <span>{props.filename}</span>
        <IconButton type="button" onClick={props.remove} tooltip="Remove attachment">
            <X size={14} />
        </IconButton>
    </div>
);

/** Button to collapse or expand an entry in the transcript. */
const CollapseButton = (props: {
    label: string;
    isExpanded: boolean;
    setExpanded: (isExpanded: boolean) => void;
}) => (
    <div class={styles.gutter}>
        <IconButton
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
    resolveRequest: RequestResolver;
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
                    onClick={() => props.resolveRequest(props.request.id, "rejected")}
                >
                    Reject
                </Button>
                <Button
                    variant="positive"
                    onClick={() => props.resolveRequest(props.request.id, "approved")}
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

const LLMTurnNoticeView = (props: { notice: LLMTurnNotice }) => (
    <>
        <span class={props.notice.kind === "error" ? styles.error : styles.note}>
            {props.notice.kind === "error" ? "Error" : "Note"}
        </span>
        {`: ${props.notice.message}`}
    </>
);
