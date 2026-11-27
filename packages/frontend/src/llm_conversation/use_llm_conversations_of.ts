import { createRelatedDocumentsView } from "catcolab-documents-solid";
import { type Accessor, createMemo, createResource, mapArray, type Resource } from "solid-js";

import type { DocumentRef } from "catcolab-documents";
import { useApi, useBinder } from "../api";
import { resolveSupportedDocument } from "./document_resolution";
import type { ApiLLMConversation, ApiLLMConversationAttachment } from "./live_doc_compatibility";

export type ScopedLLMConversation = {
    conversation: ApiLLMConversation;
    attachment: ApiLLMConversationAttachment;
};

/** LLM conversations in the one-level relation scope of the given documents, newest first.

Resolved through the binder, re-resolving whenever the reactive relation views
of the origins or their scoped attachments change.
 */
export function useLLMConversationsOf(
    refIds: Accessor<readonly string[]>,
): Resource<ScopedLLMConversation[]> {
    const api = useApi();
    const binder = useBinder();
    const refForId = (id: string): DocumentRef => ({ id, version: null, server: api.serverHost });

    const originIds = createMemo(() => [...new Set(refIds())]);
    const originRelations = mapArray(originIds, (id) => {
        const ref = refForId(id);
        return createRelatedDocumentsView(binder, () => ref, { direction: "both" });
    });

    const scopeIds = createMemo(
        () => {
            const ids = new Set(originIds());
            for (const related of originRelations()) {
                for (const group of Object.values(related())) {
                    for (const summary of group) {
                        if (summary.typeName !== "llmconversation") {
                            ids.add(summary.ref.id);
                        }
                    }
                }
            }
            return [...ids];
        },
        undefined,
        { equals: (a, b) => a.length === b.length && a.every((id, index) => id === b[index]) },
    );

    const conversationRelations = mapArray(scopeIds, (id) => {
        const ref = refForId(id);
        const related = createRelatedDocumentsView(binder, () => ref, {
            direction: "used-by",
            links: ["llmconversation-of"],
        });
        return () => ({ ref, summaries: related()["llmconversation-of"] });
    });

    const [conversations] = createResource(
        () =>
            conversationRelations()
                .map((entry) => entry())
                .filter(({ summaries }) => summaries.length > 0),
        async (current) => {
            const groups = await Promise.all(
                current.map(async ({ ref, summaries }) => {
                    const snapshot = await binder.getDocumentSnapshotFromRef(ref);
                    if (snapshot.tag === "Err") {
                        return [];
                    }
                    const resolved = await resolveSupportedDocument(binder, ref);
                    if (!resolved) {
                        return [];
                    }
                    const attachment = resolved.document;
                    return (
                        await Promise.all(
                            summaries.map(async (summary) => {
                                const result = await binder.loadLLMConversationFromRef(
                                    attachment,
                                    summary.ref,
                                );
                                return result.tag === "Ok"
                                    ? {
                                          conversation: result.content,
                                          attachment,
                                          createdAt: summary.createdAt,
                                      }
                                    : undefined;
                            }),
                        )
                    ).filter((item) => item !== undefined);
                }),
            );
            const byRefId = new Map(groups.flat().map((item) => [item.conversation.ref.id, item]));
            return [...byRefId.values()]
                .toSorted((a, b) => b.createdAt - a.createdAt)
                .map(({ conversation, attachment }) => ({ conversation, attachment }));
        },
    );

    return conversations;
}
