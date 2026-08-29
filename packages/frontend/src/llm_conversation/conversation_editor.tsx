import * as Forms from "@modular-forms/solid";
import type { SubmitHandler } from "@modular-forms/solid";
import { makeEventListener } from "@solid-primitives/event-listener";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import { createScrollPosition, getScrollParent } from "@solid-primitives/scroll";
import Send from "lucide-solid/icons/send";
import { createMemo, For, lazy, Match, onMount, Suspense, Switch, Show, JSX } from "solid-js";

import { LLMInteraction } from "catcolab-document-types";
import { Button, CodeView, Foldable, type FocusHandle, IconButton } from "catcolab-ui-components";
import type { ApiDocumentStore } from "../api";
import { useInferenceKey } from "../user/inference_key_context";
import { createLLMConversationController } from "./conversation_controller";
import type { ApiLLMConversation } from "./live_doc_compatibility";

import styles from "./conversation_editor.module.css";

/** Form data for a message to send to the LLM. */
type LLMMessageForm = {
    message: string;
};

export function LLMConversationEditor(props: {
    conversation: ApiLLMConversation;
    documentStore: ApiDocumentStore;
    focus: FocusHandle;
}) {
    void LazyMarkdownMessage.preload();

    const inferenceKey = useInferenceKey();
    const controller = createLLMConversationController(
        () => props.conversation,
        () => props.documentStore,
        inferenceKey,
    );
    const resolveRequest: RequestResolver = (id, resolution) =>
        props.conversation.resolveFeedbackRequest(id, resolution);

    // Memoize complete list of interactions, persisted and ephemeral.
    const interactions = createMemo(() => [
        ...props.conversation.interactions(),
        ...controller.state.liveInteractions,
    ]);

    // Set up form for user to send messages.
    const [form, { Form, Field }] = Forms.createForm<LLMMessageForm>();

    const canSubmit = (): boolean => {
        const hasMessage = Boolean(Forms.getValue(form, "message")?.trim());
        return inferenceKey()?.tag === "Ready" && !form.submitting && hasMessage;
    };

    const onSubmit: SubmitHandler<LLMMessageForm> = (values) => {
        Forms.reset(form, "message");
        Forms.focus(form, "message");
        return controller.runTurn({ content: values.message, files: [] });
    };

    // Set up `Shift + Enter` shortcut to send message.
    makeEventListener(window, "keydown", (evt) => {
        if (!props.focus.hasFocus()) {
            return;
        }
        if (evt.shiftKey && evt.key === "Enter" && canSubmit()) {
            Forms.submit(form);
            evt.preventDefault();
        }
    });

    // Set up autoscrolling to bottom of content.
    let conversation!: HTMLDivElement;
    onMount(() => autoscroll(conversation));

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
            <Form class={styles.form} onSubmit={onSubmit}>
                <Field name="message">
                    {(field, fieldProps) => (
                        <textarea
                            {...fieldProps}
                            rows={1}
                            value={field.value ?? ""}
                            placeholder="Type a message, then press Shift-Enter to send"
                        />
                    )}
                </Field>
                <IconButton type="submit" disabled={!canSubmit()} tooltip="Send message">
                    <Send size={24} />
                </IconButton>
            </Form>
        </div>
    );
}

/** Keep the pane scrolled to the bottom as the conversation grows. */
function autoscroll(content: HTMLElement) {
    const SCROLL_SLACK = 32;
    const pane = getScrollParent(content);
    const scroll = createScrollPosition(pane);

    /** Is the pane at the bottom, as of the last time that it was scrolled? */
    const following = createMemo(
        () => pane.scrollHeight - scroll.y - pane.clientHeight <= SCROLL_SLACK,
    );

    createResizeObserver(content, () => {
        if (following()) {
            pane.scrollTop = pane.scrollHeight;
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
            {(message) => (
                <div class={styles.userMessage}>
                    <MarkdownMessage content={message().content} />
                </div>
            )}
        </Match>
        <Match when={props.interaction.tag === "llm-message" && props.interaction}>
            {(message) => (
                <div class={styles.llmMessage}>
                    <MarkdownMessage content={message().content} />
                </div>
            )}
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

const CodeExecution = (props: { execution: LLMInteraction & { tag: "llm-code-execution" } }) => (
    <Foldable title="Ran code">
        <CodeSection label="JavaScript">
            <CodeView lang="javascript" text={props.execution.code} />
        </CodeSection>
        <CodeSection label={props.execution.result.tag === "Ok" ? "Result" : "Error"}>
            <pre>
                {props.execution.result.tag === "Ok"
                    ? props.execution.result.value
                    : props.execution.result.error}
            </pre>
        </CodeSection>
        <Show when={props.execution.transaction !== undefined}>
            <CodeView lang="json" text={JSON.stringify(props.execution.transaction, null, 2)} />
        </Show>
    </Foldable>
);

const CodeSection = (props: { label: string; children: JSX.Element }) => (
    <div>
        <div>{props.label}</div>
        {props.children}
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
