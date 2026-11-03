import { type Accessor, type JSX, createContext, onCleanup, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { type ApiBinder, useBinder } from "../api";
import { type InferenceKeyResult, useInferenceKey } from "../user/inference_key_context";
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
    const controllers = new Map<string, LLMConversationController>();
    return {
        get(conversation: ApiLLMConversation): LLMConversationController {
            const { server, id, version } = conversation.handle.ref;
            const key = `${server}/${id}/${version ?? "live"}`;
            let controller = controllers.get(key);
            if (!controller) {
                controller = createLLMConversationController(conversation, binder, inferenceKey);
                controllers.set(key, controller);
            }
            return controller;
        },
        clear() {
            controllers.clear();
        },
    };
}

const LLMConversationContext = createContext<ReturnType<typeof createLLMConversationRegistry>>();

/** Keep turn state above the router's document editors. */
export function LLMConversationProvider(props: { children: JSX.Element }) {
    const registry = createLLMConversationRegistry(useBinder(), useInferenceKey());
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
