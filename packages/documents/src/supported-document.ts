import type { Instance } from "./instance/document";
import type { LLMConversation } from "./llm-conversation";
import type { ModelDocument } from "./model/document";
import type { Notebook } from "./model/document";
import type { Shape } from "./shape";

/** Document owners that can be bound and staged in a transaction. */
export type SupportedDocument<S extends Shape = Shape, H = unknown, V = unknown> =
    | Notebook<S, ModelDocument, H, V>
    | Instance<S, H, V>
    | LLMConversation<SupportedDocument<S, H, V>, H>;
