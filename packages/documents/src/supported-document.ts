import type { Instance } from "./instance/instance";
import type { LLMConversation } from "./llm-conversation";
import type { ModelDocument } from "./model/document";
import type { Notebook } from "./model/notebook";
import type { Shape } from "./shape";

/**
 * The kinds of document objects that can be created through a `Binder` and
 * staged in a transaction.
 */
export type SupportedDocument<S extends Shape = Shape, H = unknown, V = unknown> =
    | Notebook<S, ModelDocument, H, V>
    | Instance<S, H, V>
    | LLMConversation<SupportedDocument<S, H, V>, H>;
