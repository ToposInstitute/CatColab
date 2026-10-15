import type { Binder, Result, Shape, SupportedDocument } from "catcolab-documents";
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
    binder: Binder<Handle, Version>,
    handle: Handle,
): Promise<ResolvedSupportedDocument<Handle, Version> | undefined> {
    const view = binder.getDocumentView(handle);
    switch (view.type) {
        case "model": {
            const shape = shapeForTheory(notebookShapes, view.theory);
            return shape === undefined
                ? undefined
                : {
                      document: await loaded(
                          binder.loadNotebookFromRef(shape, binder.getDocumentRef(handle)),
                      ),
                      modelRefId: binder.getDocumentRef(handle).id,
                  };
        }
        case "instance": {
            const schemaHandle = await handleForRef(binder, view.instanceOf);
            const schemaView = binder.getDocumentView(schemaHandle);
            if (schemaView.type !== "model") {
                return undefined;
            }
            const schemaShape = shapeForTheory(notebookShapes, schemaView.theory);
            return schemaShape === undefined
                ? undefined
                : {
                      document: await loaded(
                          binder.loadInstanceFromRef(
                              await loaded(
                                  binder.loadNotebookFromRef(
                                      schemaShape,
                                      binder.getDocumentRef(schemaHandle),
                                  ),
                              ),
                              binder.getDocumentRef(handle),
                          ),
                      ),
                      modelRefId: binder.getDocumentRef(schemaHandle).id,
                  };
        }
        case "llmconversation": {
            const inner = await resolveSupportedDocument(
                binder,
                await handleForRef(binder, view.llmConversationOf),
            );
            return inner === undefined
                ? undefined
                : {
                      document: await loaded(
                          binder.loadLLMConversationFromRef(
                              inner.document,
                              binder.getDocumentRef(handle),
                          ),
                      ),
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
    binder: Binder<Handle, Version>,
    ref: { _id: string; _version: string | null; _server: string },
): Promise<Handle> {
    const result = await binder.getHandle({
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

async function loaded<T>(result: Promise<Result<T>>): Promise<T> {
    const value = await result;
    if (value.tag === "Err") {
        throw new Error(value.content.map((issue) => issue.message).join("\n"));
    }
    return value.content;
}
