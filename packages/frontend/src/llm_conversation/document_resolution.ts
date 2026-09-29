import type { Binder, Shape, SupportedDocument } from "catcolab-documents";
import { notebookShapes } from "../model/shapes";

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
    const result = await binder.loadSupportedDocumentFromRef(
        notebookShapes,
        binder.getDocumentRef(handle),
    );
    if (result.tag === "Err") {
        return undefined;
    }
    return {
        document: result.content,
        modelRefId: modelRootRefId(binder, result.content),
    };
}

/** The ref id of the model notebook at the root of a document's dependency chain. */
function modelRootRefId<Handle, Version>(
    binder: Binder<Handle, Version>,
    document: SupportedDocument<Shape, Handle, Version>,
): string {
    switch (document.type) {
        case "model":
            return binder.getDocumentRef(document.handle).id;
        case "instance":
            return binder.getDocumentRef(document.schema.handle).id;
        case "llmconversation":
            return modelRootRefId(binder, document.attachment);
    }
}
