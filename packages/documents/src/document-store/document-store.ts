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

/** A plain, immutable value. No framework proxies cross the storage boundary. */
export type DeepReadonly<T> = T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** One published version of a document. Equality of revisions is opaque. */
export interface DocumentSnapshot {
    readonly revision: object;
    readonly document: DeepReadonly<Document>;
}

/** Create a document snapshot. */
export function createDocumentSnapshot(document: Readonly<Document>): DocumentSnapshot {
    const copy = structuredClone(document);
    // Recursively freeze the copy.
    function freeze(value: unknown): void {
        if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
            for (const child of Object.values(value)) {
                freeze(child);
            }
            Object.freeze(value);
        }
    }
    freeze(copy);
    // This freezes a newly created object so any previousSnapshot.revision !== thisSnapshot.revision.
    const revision = Object.freeze({});
    return Object.freeze({ revision, document: copy });
}

export interface DocumentStore<Handle, Version = unknown> {
    // An async function to create a document handle from initial data.
    createHandle(initialDoc: Document): Promise<Handle>;
    // An async function to get a document handle from a `DocumentRef`,
    // as a `Result` (`Ok` with the handle, or `Err` with issues).
    getHandle(ref: DocumentRef): Promise<Result<Handle>>;
    // Apply modifications to a handle.
    changeDocument(handle: Handle, fn: (doc: Document) => void): void;
    //  Subscribe a callback to document changes. Although onChange has an
    //  initial delivery this is handled by catcolab-documents, this subscribe
    //  does not need to deliver that.
    subscribe(handle: Handle, callback: (snapshot: DocumentSnapshot) => void): () => void;
    // Get the reference for a handle
    getDocumentRef(handle: Handle): DocumentRef;
    // Current snapshot, including when no listeners exist. Repeated unchanged
    // reads return the same envelope. Previously returned values never mutate.
    getDocumentSnapshot(handle: Handle): DocumentSnapshot;
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

export function getDocumentSnapshot<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
): DeepReadonly<Document> {
    return store.getDocumentSnapshot(handle).document;
}
