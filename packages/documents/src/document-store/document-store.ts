import type { Document } from "catcolab-document-types";
import type { Result } from "../result";

export interface DocumentRef {
    id: string;
    version: string | null;
    server?: string;
}

/**
 * The versions of a single document used for transactions. Commiting brings the
 * document from before to after, while reverting does the opposite.
 */
export interface DocumentChange<Version> {
    before: Version;
    after: Version;
}

/** A replaceable view of a value that may be reactive in the host application. */
export interface ReactiveView<T extends object> {
    readonly current: Readonly<T>;
    replace(next: T): void;
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
    // Create a working copy of the document at `handle`. Changes made to the
    // draft are not visible through `handle` until it is committed.
    createDraft(handle: Handle): Handle;
    // Merge the changes made to `draft` back into the document at `handle`.
    commitDraft(handle: Handle, draft: Handle): DocumentChange<Version>;
    // Stop tracking a draft, discarding its edits without committing them.
    discardDraft(draft: Handle): void;
    // Undo the changes recorded in a change returned by `commitDraft`.
    revertCommit(handle: Handle, change: DocumentChange<Version>): void;
    // Create a reactive view for values derived from documents. Stores may
    // use this hook to integrate their host application's reactive primitives.
    createReactiveView?<T extends object>(initial: T): ReactiveView<T>;
}

/** Create a store-native reactive view, falling back to a plain replaceable value. */
export function createReactiveView<Handle, T extends object>(
    store: DocumentStore<Handle>,
    initial: T,
): ReactiveView<T> {
    if (store.createReactiveView) {
        return store.createReactiveView(initial);
    }

    let current: T = initial;
    return {
        get current(): Readonly<T> {
            return current;
        },
        replace(next: T): void {
            current = next;
        },
    };
}
