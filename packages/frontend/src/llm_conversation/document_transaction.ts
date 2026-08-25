import type { Document } from "catcolab-document-types";
import type { DocumentStore } from "catcolab-documents";

/**
 * Transaction semantics for staging edits to a document behind a working copy,
 * and later committing that copy back over the original. This file is expected
 * to be replaced with a more principled implementation that is kinder to
 * automerge in the future.
 */

/**
 * Overwrites every key of `handle`'s document with the corresponding key from
 * `replacement`, except for `preservedKeys`, whose current values are kept
 * as-is.
 */
export function overwriteDocument<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    replacement: Document,
    preservedKeys: ReadonlyArray<string> = [],
): void {
    store.changeDocument(handle, (document) => {
        const mutable = document as unknown as Record<string, unknown>;
        const preserved = Object.fromEntries(preservedKeys.map((key) => [key, mutable[key]]));
        for (const key of Object.keys(mutable)) {
            delete mutable[key];
        }
        Object.assign(mutable, replacement, preserved);
    });
}

/**
 * A handle for coordinating transactions between documents.
 */
export type DocumentTransaction = {
    /** Overwrites the working copy with the current contents of the source. */
    stage(): void;
    /** Overwrites the source document with the current contents of the working copy. */
    commit(): void;
};

function dumpDocument<Handle>(store: DocumentStore<Handle>, handle: Handle): Document {
    return store.copyValue(handle, store.getDocumentView(handle));
}

/**
 * Given {copy, commit}{Store,Handle} create a document transaction between the
 * copy and the commit. Both sides are read fresh via the stores on every
 * `stage`/`commit` call.
 *
 * `preservedKeys` names top-level keys that should not be overwritten in
 * either direction, e.g. `instanceOf`, which should keep pointing at the
 * working copy's own schema while staged, and at the real schema once
 * committed.
 */
export function createDocumentTransaction<Handle>(options: {
    copyStore: DocumentStore<Document>;
    copyHandle: Document;
    commitStore: DocumentStore<Handle>;
    commitHandle: Handle;
    preservedKeys?: ReadonlyArray<string>;
}): DocumentTransaction {
    const preservedKeys = options.preservedKeys ?? [];
    return {
        stage() {
            overwriteDocument(
                options.copyStore,
                options.copyHandle,
                dumpDocument(options.commitStore, options.commitHandle),
                preservedKeys,
            );
        },
        commit() {
            overwriteDocument(
                options.commitStore,
                options.commitHandle,
                dumpDocument(options.copyStore, options.copyHandle),
                preservedKeys,
            );
        },
    };
}
