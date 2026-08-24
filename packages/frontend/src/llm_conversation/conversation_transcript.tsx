import { type Accessor, For, type JSX, Match, Show, Switch } from "solid-js";

import type { InlineFile, LLMInteraction } from "catcolab-document-types";
import type {
    LLMConversation as LLMConversationAPI,
    LLMConversationAttachment,
    Shape,
} from "catcolab-documents";
import { Button, CodeView, Foldable } from "catcolab-ui-components";
import MarkdownMessage from "./markdown_message";

export function ConversationTranscript<
    Handle,
    Attachment extends LLMConversationAttachment<Shape, Handle>,
>(props: {
    conversation: LLMConversationAPI<Attachment, Handle>;
    /** Reactive view of the conversation's persisted interactions. */
    interactions: Accessor<readonly LLMInteraction[]>;
    /** Ephemeral turn activity: live tool calls, or the failed turn's attempts. */
    liveInteractions: Accessor<readonly LLMInteraction[]>;
    streamingContent: string;
    canEdit: boolean;
    ref?: (element: HTMLDivElement) => void;
}) {
    return (
        <div class="llm-conversation-transcript" ref={props.ref}>
            <Show
                when={props.interactions().length > 0 || props.liveInteractions().length > 0}
                fallback={<div class="llm-conversation-empty">Ask about this model to begin.</div>}
            >
                <For each={props.interactions()}>
                    {(interaction) => (
                        <ConversationInteraction
                            interaction={interaction}
                            conversation={props.conversation}
                            canEdit={props.canEdit}
                        />
                    )}
                </For>
                <For each={props.liveInteractions()}>
                    {(interaction) => (
                        <div class="llm-conversation-ephemeral">
                            <ConversationInteraction
                                interaction={interaction}
                                conversation={props.conversation}
                                canEdit={props.canEdit}
                            />
                        </div>
                    )}
                </For>
            </Show>
            <Show when={props.streamingContent}>
                <AssistantMessage content={props.streamingContent} streaming />
            </Show>
        </div>
    );
}

function ConversationInteraction<
    Handle,
    Attachment extends LLMConversationAttachment<Shape, Handle>,
>(props: {
    interaction: LLMInteraction;
    conversation: LLMConversationAPI<Attachment, Handle>;
    canEdit: boolean;
}) {
    return (
        <Switch>
            <Match when={props.interaction.tag === "user-message" ? props.interaction : undefined}>
                {(message) => <UserMessage content={message().content} files={message().files} />}
            </Match>
            <Match when={props.interaction.tag === "llm-message" ? props.interaction : undefined}>
                {(message) => <AssistantMessage content={message().content} />}
            </Match>
            <Match
                when={
                    props.interaction.tag === "llm-code-execution" ? props.interaction : undefined
                }
            >
                {(execution) => <CodeExecution execution={execution()} />}
            </Match>
            <Match
                when={
                    props.interaction.tag === "user-feedback-request"
                        ? props.interaction
                        : undefined
                }
            >
                {(request) => (
                    <FeedbackRequest
                        request={request()}
                        conversation={props.conversation}
                        canEdit={props.canEdit}
                    />
                )}
            </Match>
        </Switch>
    );
}

function UserMessage(props: { content: string; files: InlineFile[] }) {
    return (
        <div class="llm-message llm-user-message">
            <div class="llm-message-label">You</div>
            <Show when={props.content}>
                <div class="llm-message-content">{props.content}</div>
            </Show>
            <Show when={props.files.length > 0}>
                <div class="llm-message-attachments">
                    <For each={props.files}>{(file) => <span>{file.filename}</span>}</For>
                </div>
            </Show>
        </div>
    );
}

function AssistantMessage(props: { content: string; streaming?: boolean }) {
    return (
        <div class="llm-message llm-assistant-message">
            <div class="llm-message-label">CatColab{props.streaming ? " · thinking" : ""}</div>
            <Show
                when={!props.streaming}
                fallback={<div class="llm-message-content">{props.content}</div>}
            >
                <MarkdownMessage content={props.content} />
            </Show>
        </div>
    );
}

function CodeExecution(props: {
    execution: Extract<LLMInteraction, { tag: "llm-code-execution" }>;
}) {
    const result = () =>
        props.execution.result.tag === "Ok"
            ? props.execution.result.value
            : props.execution.result.error;
    const transaction = () =>
        props.execution.transaction === undefined
            ? undefined
            : JSON.stringify(props.execution.transaction, null, 2);

    return (
        <>
            <Foldable class="llm-code-execution" title="Ran code">
                <CodeSection label="JavaScript">
                    <div class="llm-code-view">
                        <CodeView lang="javascript" text={props.execution.code} />
                    </div>
                </CodeSection>
                <CodeSection label={props.execution.result.tag === "Ok" ? "Result" : "Error"}>
                    <pre class="llm-code-result">{result()}</pre>
                </CodeSection>
            </Foldable>
            <Show when={transaction()}>
                {(transaction) => (
                    <Foldable class="llm-transaction" title="Proposed transaction">
                        <div class="llm-code-view">
                            <CodeView lang="json" text={transaction()} />
                        </div>
                    </Foldable>
                )}
            </Show>
        </>
    );
}

function CodeSection(props: { label: string; children: JSX.Element }) {
    return (
        <div class="llm-code-section">
            <div class="llm-code-section-label">{props.label}</div>
            {props.children}
        </div>
    );
}

function FeedbackRequest<
    Handle,
    Attachment extends LLMConversationAttachment<Shape, Handle>,
>(props: {
    request: Extract<LLMInteraction, { tag: "user-feedback-request" }>;
    conversation: LLMConversationAPI<Attachment, Handle>;
    canEdit: boolean;
}) {
    const resolve = (resolution: "approved" | "rejected") => {
        props.conversation.resolveFeedbackRequest(props.request.id, resolution);
    };

    return (
        <div class="llm-feedback-request">
            <div class="llm-message-label">Approval requested</div>
            <div class="llm-message-content">{props.request.content}</div>
            <Show
                when={props.request.resolution === "unresolved"}
                fallback={<div class="llm-feedback-resolution">{props.request.resolution}</div>}
            >
                <div class="llm-feedback-actions">
                    <Button
                        variant="utility"
                        disabled={!props.canEdit}
                        onClick={() => resolve("rejected")}
                    >
                        Reject
                    </Button>
                    <Button
                        variant="positive"
                        disabled={!props.canEdit}
                        onClick={() => resolve("approved")}
                    >
                        Approve
                    </Button>
                </div>
            </Show>
        </div>
    );
}
