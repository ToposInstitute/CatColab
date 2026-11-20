import type { Binder, DocumentRef, Result, Shape, SupportedDocument } from "catcolab-documents";
import { notebookShapes, shapeForTheory } from "../model/shapes";
import { assertExhaustive } from "../util/assert_exhaustive";

/** A document resolved from a reference, together with the ref id of the model
 * notebook at the root of its dependency chain.
 */
export type ResolvedSupportedDocument<Handle, Version> = {
    document: SupportedDocument<Shape, Handle, Version>;
    modelRefId: string;
};

/** Resolve a document reference into its API object, or undefined when the
 * frontend cannot load the document. Reference lookup and loading failures throw.
 */
export async function resolveSupportedDocument<Handle, Version>(
    binder: Binder<Handle, Version>,
    ref: DocumentRef,
): Promise<ResolvedSupportedDocument<Handle, Version> | undefined> {
    const snapshot = await loaded(binder.getDocumentSnapshotFromRef(ref));
    switch (snapshot.type) {
        case "model": {
            const shape = shapeForTheory(notebookShapes, snapshot.theory);
            return shape === undefined
                ? undefined
                : {
                      document: await loaded(binder.loadNotebookFromRef(shape, ref)),
                      modelRefId: ref.id,
                  };
        }
        case "instance": {
            const schemaRef = refForLink(snapshot.instanceOf);
            const schema = await loaded(binder.getDocumentSnapshotFromRef(schemaRef));
            if (schema.type !== "model") {
                return undefined;
            }
            const schemaShape = shapeForTheory(notebookShapes, schema.theory);
            return schemaShape === undefined
                ? undefined
                : {
                      document: await loaded(
                          binder.loadInstanceFromRef(
                              await loaded(binder.loadNotebookFromRef(schemaShape, schemaRef)),
                              ref,
                          ),
                      ),
                      modelRefId: schemaRef.id,
                  };
        }
        case "llmconversation": {
            const inner = await resolveSupportedDocument(
                binder,
                refForLink(snapshot.llmConversationOf),
            );
            return inner === undefined
                ? undefined
                : {
                      document: await loaded(
                          binder.loadLLMConversationFromRef(inner.document, ref),
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

/** Convert a stored link into the reference of the document it points at. */
function refForLink(ref: { _id: string; _version: string | null; _server: string }): DocumentRef {
    return { id: ref._id, version: ref._version, server: ref._server };
}

async function loaded<T>(result: Promise<Result<T>>): Promise<T> {
    const value = await result;
    if (value.tag === "Err") {
        throw new Error(value.content.map((issue) => issue.message).join("\n"));
    }
    return value.content;
}
