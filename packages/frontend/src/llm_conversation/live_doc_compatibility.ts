import type { Document } from "catcolab-document-types";
import type {
    DocumentRef,
    LLMConversation as LLMConversationAPI,
    LLMConversationAttachment,
    LLMConversationDocument,
    Shape,
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

/**
 * Live*Doc compatibility and binder loading for LLM conversations, following
 * `instance/live_doc_compatibility.ts`; see that module for the details of the
 * pattern. Differences: the attachment may be a model notebook or a data
 * instance, and the facade carries the conversation object for use by the
 * conversation editor.
 */

export type ApiLLMConversationAttachment = LLMConversationAttachment<
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

async function loadNotebook(api: Api, binder: ApiBinder, modelRefId: string) {
    const ref = { id: modelRefId, version: null, server: api.serverHost };
    const handle = await getHandle(binder, ref);
    const document = binder.store.getDocumentView(handle);
    if (document.type !== "model") {
        throw new Error(`Cannot load document of type "${document.type}" as a model notebook.`);
    }
    const shape = shapeForTheory(notebookShapes, document.theory);
    if (!shape) {
        throw new Error(`LLM conversations are not supported for theory "${document.theory}".`);
    }
    const notebook = await binder.loadNotebookFromRef(shape, ref);
    if (notebook.tag === "Err") {
        throw new Error(notebook.content.map((issue) => issue.message).join("\n"));
    }
    return notebook.content;
}

async function loadInstance(
    api: Api,
    binder: ApiBinder,
    instanceRefId: string,
    modelRefId: string,
) {
    const schema = await loadNotebook(api, binder, modelRefId);
    const instance = await binder.loadInstanceFromRef(schema, {
        id: instanceRefId,
        version: null,
        server: api.serverHost,
    });
    if (instance.tag === "Err") {
        throw new Error(instance.content.map((issue) => issue.message).join("\n"));
    }
    return instance.content;
}

/** Load the document with the given ref as an LLM conversation attachment. */
async function loadAttachment(
    api: Api,
    binder: ApiBinder,
    refId: string,
    document: Document,
): Promise<{ attachment: ApiLLMConversationAttachment; modelRefId: string }> {
    switch (document.type) {
        case "model":
            return { attachment: await loadNotebook(api, binder, refId), modelRefId: refId };
        case "instance": {
            const modelRefId = document.instanceOf._id;
            const attachment = await loadInstance(api, binder, refId, modelRefId);
            return { attachment, modelRefId };
        }
        default:
            throw new Error(`Cannot attach an LLM conversation to a "${document.type}" document.`);
    }
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
    const attachmentRef = { id: of._id, version: null, server: api.serverHost };
    const attachmentDocument: Document = binder.store.getDocumentView(
        await getHandle(binder, attachmentRef),
    );

    const { attachment, modelRefId } = await loadAttachment(
        api,
        binder,
        of._id,
        attachmentDocument,
    );
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
    const { attachment } = await loadAttachment(
        api,
        binder,
        attachTo.docRef.refId,
        attachTo.liveDoc.doc,
    );
    const conversation = await binder.createLLMConversation(attachment, llmModel, {
        title: "",
    });
    return conversation.handle.ref.id;
}
