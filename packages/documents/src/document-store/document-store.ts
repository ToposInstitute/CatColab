import type { Document, Link } from "catcolab-document-types";
import type { MetaDocument } from "../meta_document";
import type { Result } from "../result";
import type { DeepReadonly } from "../util/deep-readonly";

export interface DocumentRef {
    id: string;
    version: string | null;
    server?: string;
}

/** The links a document has to other documents. */
export function documentLinks(document: Document): Link[] {
    switch (document.type) {
        case "model":
            return [];
        case "diagram":
            return [document.diagramIn];
        case "instance":
            return [document.instanceOf];
        case "analysis":
            return [document.analysisOf];
        case "llmconversation":
            return [document.llmConversationOf];
    }
}

/**
 * The versions of a single document used for transactions. Commiting brings the
 * document from before to after, while reverting does the opposite.
 */
export interface DocumentChange<Version> {
    before: Version;
    after: Version;
}

export interface DocumentStore<Handle, Version = unknown> {
    readonly meta: MetaDocument;
    // An async function to create a document handle from initial data.
    createHandle(initialDoc: Document): Promise<Handle>;
    // An async function to get a document handle from a `DocumentRef`,
    // as a `Result` (`Ok` with the handle, or `Err` with issues).
    getHandle(ref: DocumentRef): Promise<Result<Handle>>;
    // Apply modifications to a handle.
    changeDocument(handle: Handle, fn: (doc: Document) => void): void;
    //  Subscribe a callback to document changes. Although onChange has an
    //  initial delivery this is handled by catcolab-documents, this subscribe
    //  does not need to deliver that. Callbacks receive the changed handle;
    //  read its current state through getDocumentSnapshot.
    subscribe(handle: Handle, callback: (handle: Handle) => void): () => void;
    // Get the reference for a handle
    getDocumentRef(handle: Handle): DocumentRef;
    // Return an immutable snapshot of the document's current state.
    getDocumentSnapshot(handle: Handle): DeepReadonly<Document>;
    // Create a working copy of the document at `handle`. Changes made to the
    // draft are not visible through `handle` until it is committed.
    createDraft(handle: Handle): Handle;
    // Merge the changes made to `draft` back into the document at `handle`.
    commitDraft(handle: Handle, draft: Handle): DocumentChange<Version>;
    // Stop tracking a draft, discarding its edits without committing them.
    discardDraft(draft: Handle): void;
    // Undo the changes recorded in a change returned by `commitDraft`.
    revertCommit(handle: Handle, change: DocumentChange<Version>): void;
}

export function getDocumentSnapshot<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
): DeepReadonly<Document> {
    return store.getDocumentSnapshot(handle);
}
