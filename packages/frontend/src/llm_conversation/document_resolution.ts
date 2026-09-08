import type { DocumentStore, Shape, SupportedDocument } from "catcolab-documents";
import {
    instanceFromStore,
    llmConversationFromStore,
    modelNotebookFromStore,
} from "catcolab-documents";
import { notebookShapes, shapeForTheory } from "../model/shapes";

/** A document resolved from a handle, together with the ref id of the model
 * notebook at the root of its dependency chain.
 */
export type ResolvedSupportedDocument<Handle, Version> = {
    document: SupportedDocument<Shape, Handle, Version>;
    modelRefId: string;
};

/** Resolve a document handle into its API object, or undefined when the
 * frontend cannot load the document.
 */
export async function resolveSupportedDocument<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): Promise<ResolvedSupportedDocument<Handle, Version> | undefined> {
    const view = store.getDocumentView(handle);
    switch (view.type) {
        case "model": {
            const shape = shapeForTheory(notebookShapes, view.theory);
            return shape === undefined
                ? undefined
                : {
                      document: modelNotebookFromStore(shape, store, handle),
                      modelRefId: store.getDocumentRef(handle).id,
                  };
        }
        case "instance": {
            const schemaHandle = await handleForRef(store, view.instanceOf);
            const schemaView = store.getDocumentView(schemaHandle);
            if (schemaView.type !== "model") {
                return undefined;
            }
            const schemaShape = shapeForTheory(notebookShapes, schemaView.theory);
            return schemaShape === undefined
                ? undefined
                : {
                      document: instanceFromStore(
                          modelNotebookFromStore(schemaShape, store, schemaHandle),
                          store,
                          handle,
                      ),
                      modelRefId: store.getDocumentRef(schemaHandle).id,
                  };
        }
        case "llmconversation": {
            const inner = await resolveSupportedDocument(
                store,
                await handleForRef(store, view.llmConversationOf),
            );
            return inner === undefined
                ? undefined
                : {
                      document: llmConversationFromStore(store, handle, inner.document),
                      modelRefId: inner.modelRefId,
                  };
        }
        case "diagram":
        case "analysis":
            return undefined;
    }
}

/** Resolve a link to the handle of the document it points at. */
async function handleForRef<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    ref: { _id: string; _version: string | null; _server: string },
): Promise<Handle> {
    const result = await store.getHandle({
        id: ref._id,
        version: ref._version,
        server: ref._server,
    });
    if (result.tag === "Err") {
        throw new Error(
            `Cannot resolve the document ref "${ref._id}": ` +
                result.content.map((issue) => issue.message).join("\n"),
        );
    }
    return result.content;
}
