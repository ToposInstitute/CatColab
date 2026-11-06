import type { Instance } from "./instance/document";
import type { LLMConversation } from "./llm-conversation";
import type { ModelDocument } from "./model/document";
import type { Notebook } from "./model/document";
import type { CellTypeVocabulary, Shape } from "./shape";

/** Document owners that can be bound and staged in a transaction. */
export type SupportedDocument<S extends Shape = Shape, H = unknown, V = unknown> =
    | Notebook<S, ModelDocument, H, V>
    | Instance<S, H, V>
    | LLMConversation<SupportedDocument<S, H, V>, H>;

export function cellTypeVocabularies<Handle, Version>(
    documents: Iterable<SupportedDocument<Shape, Handle, Version>>,
): readonly CellTypeVocabulary[] {
    const vocabularies = new Set<CellTypeVocabulary>();
    for (const document of documents) {
        if ("shape" in document && document.shape.cellTypes !== undefined) {
            vocabularies.add(document.shape.cellTypes);
        }
    }
    return [...vocabularies];
}
