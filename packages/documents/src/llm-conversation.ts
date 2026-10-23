import {
    LLMConversation as LLMConversationMethods,
    type LLMConversationDocument,
} from "catcolab-document-methods";
import type { FeedbackResolution, LLMInteraction, Uuid } from "catcolab-document-types";
import type { DocumentStore } from "./document-store";
import type { Shape } from "./shape";
import type { SupportedDocument } from "./supported-document";
import type { DeepReadonly } from "./util/deep-readonly";
import { createSubscriptionScope } from "./util/subscription-scope";

export type { LLMConversationDocument } from "catcolab-document-methods";

export interface LLMConversation<A, H> {
    readonly handle: H;
    readonly attachment: A;
    data(): DeepReadonly<LLMConversationDocument>;
    readonly title: string;

    interactions(): DeepReadonly<LLMInteraction[]>;
    appendInteraction(interaction: LLMInteraction): void;
    appendInteractions(interactions: readonly LLMInteraction[]): void;
    rejectPendingFeedbackRequests(): void;
    resolveFeedbackRequest(
        requestId: Uuid,
        resolution: Exclude<FeedbackResolution, "unresolved">,
    ): boolean;

    update(patch: Partial<{ title: string }>): void;
    dump(): LLMConversationDocument;
    onChange(callback: () => void): () => void;
    dispose(): void;
}

export function llmConversationFromStore<
    Handle,
    Attachment extends SupportedDocument<Shape, Handle, Version>,
    Version,
>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    attachment: Attachment,
): LLMConversation<Attachment, Handle> {
    const scope = createSubscriptionScope();

    function data(): DeepReadonly<LLMConversationDocument> {
        return store.getDocumentSnapshot(handle) as DeepReadonly<LLMConversationDocument>;
    }

    function appendInteractions(interactions: readonly LLMInteraction[]): void {
        if (interactions.length === 0) {
            return;
        }
        store.changeDocument(handle, (document) => {
            for (const interaction of interactions) {
                LLMConversationMethods.appendLLMInteraction(
                    document as LLMConversationDocument,
                    interaction,
                );
            }
        });
    }

    return {
        handle,
        attachment,
        data,
        get title(): string {
            return data().name;
        },
        interactions(): DeepReadonly<LLMInteraction[]> {
            return data().interactions;
        },
        appendInteraction(interaction: LLMInteraction): void {
            appendInteractions([interaction]);
        },
        appendInteractions,
        rejectPendingFeedbackRequests(): void {
            store.changeDocument(handle, (document) => {
                LLMConversationMethods.rejectPendingFeedbackRequests(
                    document as LLMConversationDocument,
                );
            });
        },
        resolveFeedbackRequest(
            requestId: Uuid,
            resolution: Exclude<FeedbackResolution, "unresolved">,
        ): boolean {
            let resolved = false;
            store.changeDocument(handle, (document) => {
                resolved = LLMConversationMethods.resolveUserFeedbackRequest(
                    document as LLMConversationDocument,
                    requestId,
                    resolution,
                );
            });
            return resolved;
        },
        update(patch: Partial<{ title: string }>): void {
            if (patch.title !== undefined) {
                store.changeDocument(handle, (document) => {
                    (document as LLMConversationDocument).name = patch.title as string;
                });
            }
        },
        dump(): LLMConversationDocument {
            return structuredClone(store.getDocumentSnapshot(handle)) as LLMConversationDocument;
        },
        dispose: scope.dispose,
        onChange(callback: () => void): () => void {
            return scope.track(store.subscribe(handle, callback));
        },
    };
}
