import type { Binder, Result, Shape, SupportedDocument } from "catcolab-documents";
import { notebookShapes, shapeForTheory } from "../model/shapes";
import { assertExhaustive } from "../util/assert_exhaustive";

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
    const snapshot = binder.getDocumentSnapshot(handle);
    switch (snapshot.type) {
        case "model": {
            const shape = shapeForTheory(notebookShapes, snapshot.theory);
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
            const schemaHandle = await handleForRef(binder, snapshot.instanceOf);
            const schema = binder.getDocumentSnapshot(schemaHandle);
            if (schema.type !== "model") {
                return undefined;
            }
            const schemaShape = shapeForTheory(notebookShapes, schema.theory);
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
                await handleForRef(binder, snapshot.llmConversationOf),
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
        default:
            return assertExhaustive(snapshot["type"]);
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
