import { createDocumentDataView } from "catcolab-documents-solid";
import { createMemo } from "solid-js";

import {
    type LLMConversationInput,
    LLMConversationEditor as LLMConversationEditorView,
} from "catcolab-ui-components";
import { useInferenceKey } from "../user/inference_key_context";
import { useLLMConversations } from "./conversation_provider";
import type { ApiLLMConversation } from "./live_doc_compatibility";

export function LLMConversationEditor(props: { conversation: ApiLLMConversation }) {
    const inferenceKey = useInferenceKey();
    const conversations = useLLMConversations();
    const controller = createMemo(() => conversations.get(props.conversation));
    const data = createDocumentDataView(() => props.conversation);
    const interactions = createMemo(() => [
        ...data().interactions,
        ...controller().state.liveInteractions,
    ]);
    const submit = async (input: LLMConversationInput): Promise<boolean> => {
        // Keep the submission attached to the original conversation even if navigation
        // changes the editor's props while files are being read.
        const target = controller();
        if (target.state.isRunning) {
            return false;
        }
        const files = await target.readAttachments(input.files);
        if (!files || target.state.isRunning) {
            return false;
        }
        void target.runTurn({ content: input.content, files });
        return true;
    };

    return (
        <LLMConversationEditorView
            interactions={interactions()}
            streamingContent={controller().state.streamingContent}
            streamingReasoning={controller().state.streamingReasoning}
            status={
                inferenceKey()?.tag !== "Ready"
                    ? "Loading inference key..."
                    : controller().state.isRunning
                      ? "Running..."
                      : "Idle"
            }
            busy={controller().state.isRunning || inferenceKey()?.tag !== "Ready"}
            notice={controller().state.notice}
            available={inferenceKey()?.tag === "Ready" && !controller().state.isRunning}
            canRetry={controller().canRetry()}
            validateAttachments={(files) => {
                const result = controller().validateAttachments(files);
                return result.tag === "Err" ? result.content : undefined;
            }}
            onSubmit={submit}
            onRetry={() => void controller().retryTurn()}
            onResolveFeedback={(id, resolution) =>
                props.conversation.resolveFeedbackRequest(id, resolution)
            }
        />
    );
}
