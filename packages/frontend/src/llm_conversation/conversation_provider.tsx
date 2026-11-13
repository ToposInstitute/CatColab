import {
    type Accessor,
    type JSX,
    createContext,
    createEffect,
    onCleanup,
    useContext,
} from "solid-js";
import invariant from "tiny-invariant";

import { type ApiBinder, useBinder } from "../api";
import { type InferenceKeyResult, useInferenceKey } from "../user/inference_key_context";
import { useUserState } from "../user/user_state_context";
import {
    type LLMConversationController,
    createLLMConversationController,
} from "./conversation_controller";
import type { ApiLLMConversation } from "./live_doc_compatibility";

/** Application-owned controllers: editors may disappear while a turn is running. */
export function createLLMConversationRegistry(
    binder: ApiBinder,
    inferenceKey: Accessor<InferenceKeyResult | undefined>,
) {
    const controllers = new Map<string, { refId: string; controller: LLMConversationController }>();
    return {
        get(conversation: ApiLLMConversation): LLMConversationController {
            const { server, id, version } = conversation.handle.ref;
            const key = `${server}/${id}/${version ?? "live"}`;
            let controller = controllers.get(key)?.controller;
            if (!controller) {
                controller = createLLMConversationController(conversation, binder, inferenceKey);
                controllers.set(key, { refId: id, controller });
            }
            return controller;
        },
        interrupt(refId: string) {
            for (const entry of controllers.values()) {
                if (entry.refId === refId) {
                    entry.controller.interrupt();
                }
            }
        },
        clear() {
            for (const { controller } of controllers.values()) {
                controller.interrupt();
            }
            controllers.clear();
        },
    };
}

const LLMConversationContext = createContext<ReturnType<typeof createLLMConversationRegistry>>();

/** Keep turn state above the router's document editors. */
export function LLMConversationProvider(props: { children: JSX.Element }) {
    const registry = createLLMConversationRegistry(useBinder(), useInferenceKey());
    const userState = useUserState();
    createEffect(() => {
        for (const [refId, document] of Object.entries(userState.documents)) {
            if (document?.deletedAt != null) {
                registry.interrupt(refId);
            }
        }
    });
    onCleanup(() => registry.clear());
    return (
        <LLMConversationContext.Provider value={registry}>
            {props.children}
        </LLMConversationContext.Provider>
    );
}

export function useLLMConversations() {
    const registry = useContext(LLMConversationContext);
    invariant(registry, "LLM conversations should be provided as context");
    return registry;
}
