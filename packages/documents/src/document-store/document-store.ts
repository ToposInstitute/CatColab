import type { Document, Link, LinkType } from "catcolab-document-types";
import type { Result } from "../result";

export interface DocumentRef {
    id: string;
    version: string | null;
    server?: string;
}

/** Handles of documents related to a document, indexed by the type of the
 * link relating them. Every link type is present; a type with no matches
 * maps to an empty array. */
export type HandlesByLinkType<Handle> = Record<LinkType, ReadonlyArray<Handle>>;

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

/** An index of handles by link type with no handles in it. The arrays are
 * fresh, so store implementations can fill them in before answering a link
 * query. */
export function emptyHandlesByLinkType<Handle>(): Record<LinkType, Handle[]> {
    return {
        "analysis-of": [],
        "diagram-in": [],
        "instance-of": [],
        "llmconversation-of": [],
        instantiation: [],
    };
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
    // An async function to create a document handle from initial data.
    createHandle(initialDoc: Document): Promise<Handle>;
    // An async function to get a document handle from a `DocumentRef`,
    // as a `Result` (`Ok` with the handle, or `Err` with issues).
    getHandle(ref: DocumentRef): Promise<Result<Handle>>;
    // Apply modifications to a handle.
    changeDocument(handle: Handle, fn: (doc: Document) => void): void;
    // Subscribe change callbacks to our store for `onChange`. Returns a
    // function to unsubscribe.
    subscribe(handle: Handle, callback: () => void): () => void;
    // Copy values (with any proxies removed)
    copyValue<T>(handle: Handle, value: T): T;
    // Get the reference for a handle
    getDocumentRef(handle: Handle): DocumentRef;
    // Get a document view from a handle
    getDocumentView(handle: Handle): Readonly<Document>;
    // Get a plain, non-reactive snapshot of the current document. Cheaper to
    // read than the view, for computations that track changes by other means.
    getDocumentSnapshot?(handle: Handle): Readonly<Document>;
    // List the documents that depend on the document at `handle`, indexed by
    // the type of the link through which each depends on it.
    listUsedBy(handle: Handle): Promise<HandlesByLinkType<Handle>>;
    // List the documents that the document at `handle` depends on, indexed by
    // the type of each of its links.
    listDependsOn(handle: Handle): Promise<HandlesByLinkType<Handle>>;
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

/** Get a plain snapshot of the document, falling back to the view. */
export function getDocumentSnapshot<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
): Readonly<Document> {
    return store.getDocumentSnapshot
        ? store.getDocumentSnapshot(handle)
        : store.getDocumentView(handle);
}
