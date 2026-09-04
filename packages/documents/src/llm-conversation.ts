import {
    LLMConversation as LLMConversationMethods,
    type LLMConversationDocument,
} from "catcolab-document-methods";
import type { FeedbackResolution, LLMInteraction, Uuid } from "catcolab-document-types";
import type { DocumentStore } from "./document-store";
import type { Shape } from "./shape";
import type { SupportedDocument } from "./supported-document";

export type { LLMConversationDocument } from "catcolab-document-methods";

export type LLMConversationAttachment<S extends Shape, H, V> = SupportedDocument<S, H, V>;

export interface LLMConversation<A, H> {
    readonly handle: H;
    readonly attachment: A;
    readonly document: Readonly<LLMConversationDocument>;
    readonly title: string;

    interactions(): readonly LLMInteraction[];
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
}

export function llmConversationFromStore<
    Handle,
    Attachment extends LLMConversationAttachment<Shape, Handle, Version>,
    Version,
>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    attachment: Attachment,
): LLMConversation<Attachment, Handle> {
    function currentDocument(): Readonly<LLMConversationDocument> {
        return store.getDocumentView(handle) as Readonly<LLMConversationDocument>;
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
        get document(): Readonly<LLMConversationDocument> {
            return currentDocument();
        },
        get title(): string {
            return currentDocument().name;
        },
        interactions(): readonly LLMInteraction[] {
            return currentDocument().interactions;
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
            return store.copyValue(handle, currentDocument());
        },
        onChange(callback: () => void): () => void {
            return store.subscribe(handle, callback);
        },
    };
}
