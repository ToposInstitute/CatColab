import { createMemo } from "solid-js";

import {
    type LLMConversationInput,
    LLMConversationEditor as LLMConversationEditorView,
} from "catcolab-ui-components";
import { useInferenceKey } from "../user/inference_key_context";
import { createLLMConversationController } from "./conversation_controller";
import type { ApiLLMConversation } from "./live_doc_compatibility";

export function LLMConversationEditor(props: { conversation: ApiLLMConversation }) {
    const inferenceKey = useInferenceKey();
    const controller = createLLMConversationController(() => props.conversation, inferenceKey);
    const interactions = createMemo(() => [
        ...props.conversation.interactions(),
        ...controller.state.liveInteractions,
    ]);
    const submit = async (input: LLMConversationInput): Promise<boolean> => {
        const files = await controller.readAttachments(input.files);
        if (!files) {
            return false;
        }
        void controller.runTurn({ content: input.content, files });
        return true;
    };

    return (
        <LLMConversationEditorView
            interactions={interactions()}
            streamingContent={controller.state.streamingContent}
            status={
                inferenceKey()?.tag !== "Ready"
                    ? "Loading inference key..."
                    : controller.state.isRunning
                      ? "Running..."
                      : "Idle"
            }
            notice={controller.state.notice}
            available={inferenceKey()?.tag === "Ready" && !controller.state.isRunning}
            canRetry={controller.canRetry()}
            validateAttachments={(files) => {
                const result = controller.validateAttachments(files);
                return result.tag === "Err" ? result.content : undefined;
            }}
            onSubmit={submit}
            onRetry={() => void controller.retryTurn()}
            onResolveFeedback={(id, resolution) =>
                props.conversation.resolveFeedbackRequest(id, resolution)
            }
        />
    );
}
