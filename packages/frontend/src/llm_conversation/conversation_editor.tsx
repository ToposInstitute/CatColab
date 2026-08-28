import { createForm, getValue, reset, type SubmitHandler } from "@modular-forms/solid";
import Send from "lucide-solid/icons/send";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { For, Match, Switch, Show } from "solid-js";
import { SolidMarkdown } from "solid-markdown";

import { LLMInteraction } from "catcolab-document-types";
import { Button } from "catcolab-ui-components";
import type { ApiDocumentStore } from "../api";
import { useInferenceKey } from "../user/inference_key_context";
import { createLLMConversationController } from "./conversation_controller";
import type { ApiLLMConversation } from "./live_doc_compatibility";

/** Form data for a message to send to the LLM. */
type LLMMessageForm = {
    message: string;
};

export function LLMConversationEditor(props: {
    conversation: ApiLLMConversation;
    documentStore: ApiDocumentStore;
}) {
    const inferenceKey = useInferenceKey();
    const controller = createLLMConversationController(
        () => props.conversation,
        () => props.documentStore,
        inferenceKey,
    );

    const [form, { Form, Field }] = createForm<LLMMessageForm>();

    const canSubmit = (): boolean => {
        const hasMessage = Boolean(getValue(form, "message")?.trim());
        return inferenceKey()?.tag === "Ready" && !form.submitting && hasMessage;
    };

    const onSubmit: SubmitHandler<LLMMessageForm> = (values) => {
        reset(form, "message");
        return controller.runTurn({ content: values.message, files: [] });
    };

    return (
        <div class="llm-conversation">
            <div class="llm-transcript">
                <For each={props.conversation.interactions()}>
                    {(interaction) => <LLMInteractionView interaction={interaction} />}
                </For>
                <For each={controller.state.liveInteractions}>
                    {(interaction) => <LLMInteractionView interaction={interaction} />}
                </For>
                <Show when={controller.state.streamingContent}>
                    <MarkdownMessage content={controller.state.streamingContent} />
                </Show>
            </div>
            <Form onSubmit={onSubmit}>
                <Field name="message">
                    {(field, fieldProps) => (
                        <textarea
                            {...fieldProps}
                            value={field.value ?? ""}
                            placeholder="Type a message to the LLM"
                        />
                    )}
                </Field>
                <Button type="submit" variant="positive" disabled={!canSubmit()}>
                    <Send size={16} />
                    Send
                </Button>
            </Form>
        </div>
    );
}

/** Display a single interaction with (i.e., message to or from) the LLM. */
export const LLMInteractionView = (props: { interaction: LLMInteraction }) => (
    <Switch>
        <Match when={props.interaction.tag === "user-message" && props.interaction}>
            {(message) => <div class="user-message">{message().content}</div>}
        </Match>
        <Match when={props.interaction.tag === "llm-message" && props.interaction}>
            {(message) => (
                <div class="llm-message">
                    <MarkdownMessage content={message().content} />
                </div>
            )}
        </Match>
    </Switch>
);

/** Render Markdown content, such as a message from the LLM. */
export const MarkdownMessage = (props: { content: string }) => (
    <SolidMarkdown
        class="markdown-message"
        renderingStrategy="reconcile"
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
    >
        {props.content}
    </SolidMarkdown>
);

/** Support GitHub-flavored Markdown, plus math as rendered in MDX help pages. */
const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];
