import { createForm, getValue, reset, type SubmitHandler } from "@modular-forms/solid";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import { createScrollPosition, getScrollParent } from "@solid-primitives/scroll";
import Send from "lucide-solid/icons/send";
import { createMemo, For, lazy, Match, onMount, Suspense, Switch, Show, JSX } from "solid-js";

import { LLMInteraction } from "catcolab-document-types";
import { Button, CodeView, Foldable, IconButton } from "catcolab-ui-components";
import type { ApiDocumentStore } from "../api";
import { useInferenceKey } from "../user/inference_key_context";
import { createLLMConversationController } from "./conversation_controller";
import type { ApiLLMConversation } from "./live_doc_compatibility";

import styles from "./conversation_editor.module.css";

const MarkdownMessage = lazy(() => import("./markdown_message"));

/** Form data for a message to send to the LLM. */
type LLMMessageForm = {
    message: string;
};

export function LLMConversationEditor(props: {
    conversation: ApiLLMConversation;
    documentStore: ApiDocumentStore;
}) {
    void MarkdownMessage.preload();

    const inferenceKey = useInferenceKey();
    const controller = createLLMConversationController(
        () => props.conversation,
        () => props.documentStore,
        inferenceKey,
    );
    const resolveRequest: RequestResolver = (id, resolution) =>
        props.conversation.resolveFeedbackRequest(id, resolution);

    const [form, { Form, Field }] = createForm<LLMMessageForm>();

    const canSubmit = (): boolean => {
        const hasMessage = Boolean(getValue(form, "message")?.trim());
        return inferenceKey()?.tag === "Ready" && !form.submitting && hasMessage;
    };

    const onSubmit: SubmitHandler<LLMMessageForm> = (values) => {
        reset(form, "message");
        return controller.runTurn({ content: values.message, files: [] });
    };

    let conversation!: HTMLDivElement;
    onMount(() => autoscroll(conversation));

    return (
        <div class={styles.conversation} ref={conversation}>
            <div class={styles.transcript}>
                <Suspense>
                    <For each={props.conversation.interactions()}>
                        {(interaction) => (
                            <LLMInteractionView
                                interaction={interaction}
                                resolveRequest={resolveRequest}
                            />
                        )}
                    </For>
                    <For each={controller.state.liveInteractions}>
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
                </Suspense>
            </div>
            <Form class={styles.form} onSubmit={onSubmit}>
                <Field name="message">
                    {(field, fieldProps) => (
                        <textarea
                            {...fieldProps}
                            rows={1}
                            value={field.value ?? ""}
                            placeholder="Type a message to the LLM"
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
