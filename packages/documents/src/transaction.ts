import type { DocumentChange } from "./document-store";

/**
 * The changes committed by a transaction: for each document it touched, the
 * change that was committed to it.
 */
export interface Commit<Handle, Version> {
    readonly documents: ReadonlyMap<Handle, DocumentChange<Version>>;
}

/**
 * A set of document drafts staged for editing, committed as a unit. Both
 * ways of ending the transaction are one-shot: whichever is taken makes the
 * other, and the staged drafts, invalid.
 */
export interface Transaction<Handle, Version> {
    /** Merge every staged draft back into its source document. */
    commit(): Commit<Handle, Version>;
    /** Discard every staged draft, leaving the source documents untouched. */
    abort(): void;
}
