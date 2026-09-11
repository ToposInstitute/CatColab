import Plus from "lucide-solid/icons/plus";
import { createEffect, createResource, For, Show, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { UserSettings } from "catcolab-api";
import type { Document } from "catcolab-document-types";
import {
    DocumentTypeIcon,
    type FocusHandle,
    IconButton,
    InlineInput,
} from "catcolab-ui-components";
import { documentTypeLabel, type LiveDocWithRef, useApi, useBinder } from "../api";
import { DEFAULT_LLM_MODEL } from "../inference/chat";
import { ModelLibraryContext } from "../model";
import { TheoryLibraryContext } from "../theory";
import { isDocumentVisible } from "../user/user_settings";
import { LLMConversationEditor } from "./conversation_editor";
import {
    createLLMConversation,
    getLiveLLMConversation,
    supportsLLMConversation,
} from "./live_doc_compatibility";
import { useLLMConversationsOf } from "./use_llm_conversations_of";

import styles from "./llm_conversation_pane.module.css";

/** Whether the LLM conversation pane can be shown for the given document. */
export function canOpenLLMConversationPane(document: Document, settings?: UserSettings): boolean {
    return (
        supportsLLMConversation(document) &&
        isDocumentVisible({ typeName: "llmconversation" }, settings)
    );
}

/** Side pane listing the LLM conversations for the open documents. */
export function LLMConversationPane(props: {
    documents: LiveDocWithRef[];
    createOn: LiveDocWithRef | undefined;
    focus: FocusHandle;
    selectedRefId: string | undefined;
    onSelect: (refId: string | undefined, replace?: boolean) => void;
}) {
    const api = useApi();
    const binder = useBinder();
    const models = useContext(ModelLibraryContext);
    invariant(models, "Must provide model library as context to LLM conversation pane");
    const theories = useContext(TheoryLibraryContext);

    const conversations = useLLMConversationsOf(() =>
        props.documents.map((document) => document.docRef.refId),
    );
    const creationDocument = () => {
        const document = props.createOn;
        return document && supportsLLMConversation(document.liveDoc.doc) ? document : undefined;
    };

    createEffect(() => {
        const docs = conversations();
        if (
            props.documents.length > 0 &&
            docs &&
            docs.length > 0 &&
            !conversations.loading &&
            !docs.some(({ conversation }) => conversation.ref.id === props.selectedRefId)
        ) {
            props.onSelect(docs[0]!.conversation.ref.id, true);
        }
    });

    const onNewLLMConversation = async () => {
        const document = creationDocument();
        invariant(document, "The right-most document must support LLM conversations");
        const newRefId = await createLLMConversation(api, binder, document, DEFAULT_LLM_MODEL);
        props.onSelect(newRefId);
    };

    const iconLettersOf = (document: Document): [string, string] | undefined => {
        if (document.type !== "model" || !theories) {
            return undefined;
        }
        try {
            return theories.getMetadata(document.theory).iconLetters;
        } catch (_e) {
            return undefined;
        }
    };

    const [liveConversation] = createResource(
        () => props.selectedRefId,
        async (refId) => {
            const { liveConversation } = await getLiveLLMConversation(refId, api, models, binder);
            return liveConversation;
        },
    );

    return (
        <div class={styles.pane}>
            <div class={styles.header}>
                <span>LLM conversations</span>
                <Show when={creationDocument()}>
                    <IconButton
                        onClick={() => onNewLLMConversation()}
                        tooltip="New LLM conversation"
                    >
                        <Plus size={18} />
                    </IconButton>
                </Show>
            </div>
            <div class={styles.list}>
                <Show
                    when={conversations()?.length}
                    fallback={<div class={styles.placeholder}>No LLM conversations yet</div>}
                >
                    <For each={conversations()}>
                        {({ conversation, attachment }) => (
                            <div
                                class={styles.row}
                                classList={{
                                    [styles.active]: conversation.ref.id === props.selectedRefId,
                                }}
                                onMouseDown={() => props.onSelect(conversation.ref.id)}
                            >
                                <DocumentTypeIcon documentType="llmconversation" />
                                <div
                                    class={styles.rowName}
                                    onFocusIn={() => props.onSelect(conversation.ref.id)}
                                >
                                    <InlineInput
                                        text={conversation.docView.name}
                                        setText={(title) =>
                                            conversation.automergeHandle.change((doc) => {
                                                doc.name = title;
                                            })
                                        }
                                        placeholder="Untitled"
                                    />
                                </div>
                                <div
                                    class={styles.rowAttachment}
                                    title={`On ${documentTypeLabel(attachment.docView.type)} "${attachment.docView.name || "Untitled"}"`}
                                >
                                    <DocumentTypeIcon
                                        documentType={attachment.docView.type}
                                        letters={iconLettersOf(attachment.docView)}
                                    />
                                    <span>{attachment.docView.name || "Untitled"}</span>
                                </div>
                            </div>
                        )}
                    </For>
                </Show>
            </div>
            <div class={styles.editor}>
                <Show when={liveConversation.loading}>
                    <div class={styles.placeholder}>Loading LLM conversation...</div>
                </Show>
                <Show when={!liveConversation.loading && liveConversation.error}>
                    <div class={styles.placeholder}>
                        Failed to load LLM conversation: {String(liveConversation.error)}
                    </div>
                </Show>
                <Show
                    when={
                        !liveConversation.loading && !liveConversation.error && liveConversation()
                    }
                >
                    {(conversation) => (
                        <LLMConversationEditor
                            conversation={conversation().conversation}
                            focus={props.focus}
                        />
                    )}
                </Show>
            </div>
        </div>
    );
}
