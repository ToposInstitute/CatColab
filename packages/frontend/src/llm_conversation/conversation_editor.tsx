import { createForm, getValue, reset, type SubmitHandler } from "@modular-forms/solid";
import Send from "lucide-solid/icons/send";
import { For, lazy, Match, Suspense, Switch, Show } from "solid-js";

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
    void MarkdownMessage.preload();

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
                <Suspense>
                    <For each={props.conversation.interactions()}>
                        {(interaction) => <LLMInteractionView interaction={interaction} />}
                    </For>
                    <For each={controller.state.liveInteractions}>
                        {(interaction) => <LLMInteractionView interaction={interaction} />}
                    </For>
                    <Show when={controller.state.streamingContent}>
                        <MarkdownMessage content={controller.state.streamingContent} />
                    </Show>
                </Suspense>
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

const MarkdownMessage = lazy(() => import("./markdown_message"));
