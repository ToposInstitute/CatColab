import { createForm, getValue, type SubmitHandler } from "@modular-forms/solid";
import Send from "lucide-solid/icons/send";
import { For, Match, Switch, Show } from "solid-js";
import invariant from "tiny-invariant";

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
    const controller = createLLMConversationController(
        () => props.conversation,
        () => props.documentStore,
        useInferenceKey(),
    );

    const conversationDoc = () => {
        const doc = props.conversation.handle.docView;
        invariant(doc.type === "llmconversation");
        return doc;
    };

    const [form, { Form, Field }] = createForm<LLMMessageForm>();

    const formHasMessage = () => Boolean(getValue(form, "message")?.trim());

    const onSubmit: SubmitHandler<LLMMessageForm> = (values) => {
        return controller.runTurn({ content: values.message, files: [] });
    };

    return (
        <div class="llm-conversation">
            <div class="llm-transcript">
                <For each={conversationDoc().interactions}>
                    {(interaction) => <LLMInteractionView interaction={interaction} />}
                </For>
                <For each={controller.state.liveInteractions}>
                    {(interaction) => <LLMInteractionView interaction={interaction} />}
                </For>
                <Show when={controller.state.streamingContent}>
                    {controller.state.streamingContent}
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
                <Button
                    type="submit"
                    variant="positive"
                    disabled={!formHasMessage() || form.submitting}
                >
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
            {(message) => <div class="llm-message">{message().content}</div>}
        </Match>
    </Switch>
);
