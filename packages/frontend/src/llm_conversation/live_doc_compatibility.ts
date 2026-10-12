import type { Document } from "catcolab-document-types";
import type {
    DocumentRef,
    LLMConversation as LLMConversationAPI,
    LLMConversationDocument,
    Shape,
    SupportedDocument,
} from "catcolab-documents";
import { llmConversationFromStore } from "catcolab-documents";
import type {
    Api,
    ApiBinder,
    ApiDocumentHandle,
    ApiDocumentVersion,
    DocRef,
    LiveDoc,
    LiveDocWithRef,
} from "../api";
import type { LiveModelDoc, ModelLibrary } from "../model";
import { notebookShapes, shapeForTheory } from "../model/shapes";
import { assertExhaustive } from "../util/assert_exhaustive";
import { resolveSupportedDocument } from "./document_resolution";

/**
 * Live*Doc compatibility and binder loading for LLM conversations, following
 * `instance/live_doc_compatibility.ts`; see that module for the details of the
 * pattern.
 */

export type ApiLLMConversationAttachment = SupportedDocument<
    Shape,
    ApiDocumentHandle,
    ApiDocumentVersion
>;

export type ApiLLMConversation = LLMConversationAPI<
    ApiLLMConversationAttachment,
    ApiDocumentHandle
>;

export type LiveLLMConversationDoc = {
    type: "llmconversation";
    liveDoc: LiveDoc<LLMConversationDocument>;
    conversation: ApiLLMConversation;
    attachment: ApiLLMConversationAttachment;
    modelLiveDoc: LiveModelDoc["liveDoc"];
};

async function getHandle(binder: ApiBinder, ref: DocumentRef) {
    const result = await binder.store.getHandle(ref);
    if (result.tag === "Err") {
        throw new Error(result.content.map((issue) => issue.message).join("\n"));
    }
    return result.content;
}

/** Whether an LLM conversation can be attached to the given document. */
export function supportsLLMConversation(document: Document): boolean {
    switch (document.type) {
        case "model":
            return shapeForTheory(notebookShapes, document.theory) !== undefined;
        case "instance":
            return true;
        case "diagram":
        case "analysis":
        case "llmconversation":
            return false;
        default:
            return assertExhaustive(document);
    }
}

export async function getLiveLLMConversation(
    refId: string,
    api: Api,
    models: ModelLibrary<string>,
    binder: ApiBinder,
): Promise<{ liveConversation: LiveLLMConversationDoc; docRef: DocRef }> {
    const { liveDoc, docRef } = await api.getLiveDoc<LLMConversationDocument>(
        refId,
        "llmconversation",
    );
    const of = liveDoc.doc.llmConversationOf;
    if (of._version !== null || of._server !== api.serverHost) {
        throw new Error("LLM conversations require a live attachment on the current server.");
    }
    const attachmentHandle = await getHandle(binder, {
        id: of._id,
        version: null,
        server: api.serverHost,
    });
    const resolved = await resolveSupportedDocument(binder.store, attachmentHandle);
    if (resolved === undefined) {
        throw new Error(
            `Cannot attach an LLM conversation to a "${binder.store.getDocumentView(attachmentHandle).type}" document.`,
        );
    }
    const { document: attachment, modelRefId } = resolved;
    const liveModel = await models.getLiveModel(modelRefId);
    const conversationHandle = await getHandle(binder, {
        id: refId,
        version: null,
        server: api.serverHost,
    });
    const conversation = llmConversationFromStore(binder.store, conversationHandle, attachment);

    return {
        liveConversation: {
            type: "llmconversation",
            liveDoc,
            conversation,
            attachment,
            modelLiveDoc: liveModel.liveDoc,
        },
        docRef,
    };
}

/** Create a new LLM conversation attached to the given live document. */
export async function createLLMConversation(
    api: Api,
    binder: ApiBinder,
    attachTo: LiveDocWithRef,
    llmModel: string,
): Promise<string> {
    const handle = await getHandle(binder, {
        id: attachTo.docRef.refId,
        version: null,
        server: api.serverHost,
    });
    const resolved = await resolveSupportedDocument(binder.store, handle);
    if (resolved === undefined) {
        throw new Error(
            `Cannot attach an LLM conversation to a "${attachTo.liveDoc.doc.type}" document.`,
        );
    }
    const conversation = await binder.createLLMConversation(resolved.document, llmModel, {
        title: "",
    });
    return conversation.handle.ref.id;
}
