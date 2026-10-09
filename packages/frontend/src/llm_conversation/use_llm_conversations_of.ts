import { type Accessor, createMemo, createResource, type Resource } from "solid-js";
import { stringify as uuidStringify } from "uuid";

import { type ApiDocumentHandle, useApi, useBinder } from "../api";
import { useUserState } from "../user/user_state_context";
import { resolveSupportedDocument } from "./document_resolution";
import type { ApiLLMConversation, ApiLLMConversationAttachment } from "./live_doc_compatibility";

export type ScopedLLMConversation = {
    conversation: ApiLLMConversation;
    attachment: ApiLLMConversationAttachment;
};

/** LLM conversations in the one-level relation scope of the given documents, newest first.

Resolved through the binder, re-resolving whenever the relations of the
documents change in the user state.
 */
export function useLLMConversationsOf(
    refIds: Accessor<readonly string[]>,
): Resource<ScopedLLMConversation[]> {
    const api = useApi();
    const binder = useBinder();
    const userState = useUserState();

    // The store resolves relations from the user state but is not itself
    // reactive, so depend on the relations here to refetch when they change.
    // A fresh array is returned so that the resource sees the change even if
    // the ref IDs are the same.
    const source = createMemo(() => {
        const ids = refIds();
        for (const id of ids) {
            const document = userState.documents[id];
            const relations = [...(document?.dependsOn ?? []), ...(document?.usedBy ?? [])];
            for (const relation of relations) {
                const relatedId = uuidStringify(relation.refId);
                void userState.documents[relatedId]?.deletedAt;
                for (const usedBy of userState.documents[relatedId]?.usedBy ?? []) {
                    void usedBy.refId;
                }
            }
        }
        return [...ids];
    });

    const [conversations] = createResource(source, async (ids) => {
        const origins = await Promise.all(
            ids.map(async (id) => {
                const handle = await binder.getHandle({
                    id,
                    version: null,
                    server: api.serverHost,
                });
                if (handle.tag === "Err") {
                    return undefined;
                }
                return handle.content;
            }),
        );

        const scope = new Map<string, ApiDocumentHandle>();
        await Promise.all(
            origins.map(async (origin) => {
                if (!origin) {
                    return;
                }
                scope.set(origin.ref.id, origin);
                const [dependsOn, usedBy] = await Promise.all([
                    binder.listDependsOn(origin),
                    binder.listUsedBy(origin),
                ]);
                for (const handle of [
                    ...Object.values(dependsOn).flat(),
                    ...Object.values(usedBy).flat(),
                ]) {
                    if (handle.docView.type !== "llmconversation") {
                        scope.set(handle.ref.id, handle);
                    }
                }
            }),
        );

        const conversations = await Promise.all(
            [...scope.values()].map(async (attachment) => {
                const resolved = await resolveSupportedDocument(binder, attachment);
                if (!resolved) {
                    return [];
                }
                const usedBy = await binder.listUsedBy(attachment);
                return (
                    await Promise.all(
                        usedBy["llmconversation-of"].map(async (handle) => {
                            const result = await binder.loadLLMConversationFromRef(
                                resolved.document,
                                handle.ref,
                            );
                            return result.tag === "Ok"
                                ? { conversation: result.content, attachment: resolved.document }
                                : undefined;
                        }),
                    )
                ).filter((item) => item !== undefined);
            }),
        );
        const byRefId = new Map(
            conversations.flat().map((item) => [item.conversation.handle.ref.id, item]),
        );
        return [...byRefId.values()].toSorted(
            (a, b) =>
                (userState.documents[b.conversation.handle.ref.id]?.createdAt ?? 0) -
                (userState.documents[a.conversation.handle.ref.id]?.createdAt ?? 0),
        );
    });

    return conversations;
}
