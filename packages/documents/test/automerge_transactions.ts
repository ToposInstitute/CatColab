// The Automerge implementation of the `DocumentStore` draft/commit methods
// (`createDraft`/`commitDraft`/`revertCommit`), shared by the Automerge-backed
// test stores. These work at the `DocHandle` level; a store wraps them with
// whatever else its handle carries (e.g. a Solid projection).
import { applyPatches, diff, getHeads, type Heads, save } from "@automerge/automerge";
import { type DocHandle, Repo } from "@automerge/automerge-repo";

import type { Commit } from "catcolab-documents";

/**
 * Drafts live in their own private repo, so they never pollute (or sync
 * through) the repo the real documents live in.
 */
const draftRepo = new Repo();

/**
 * Clone a document into a private draft `DocHandle`. The draft is created by
 * `save`/`import` rather than `Repo.clone`: it shares the full change history
 * (so its changes merge back sensibly), but gets a fully independent backend.
 * `Automerge.clone` — what `Repo.clone` wraps — shares the source's
 * materialized-value cache, which makes `makeDocumentProjection` seed the
 * draft's Solid store with the *same* inner objects as the source's, so draft
 * edits would leak into the source view before any commit.
 */
export const createDraftDocHandle = <T>(docHandle: DocHandle<T>): DocHandle<T> =>
    draftRepo.import<T>(save(docHandle.doc()));

/**
 * Merge a draft's changes back into the source document, returning the span
 * of the source's heads across the merge — the token {@link undoDocHandleCommit}
 * inverts.
 */
export const commitDraftDocHandle = <T>(
    docHandle: DocHandle<T>,
    draft: DocHandle<T>,
): Commit<Heads> => {
    const before = getHeads(docHandle.doc());
    docHandle.merge(draft);
    const after = getHeads(docHandle.doc());
    return { before, after };
};

/**
 * Undo a commit as a *new* change: the inverse diff of the commit's span
 * applied on top of the current document, so edits made after the commit
 * survive the revert.
 *
 * `applyPatches` handles map-key deletions (which an inverse diff produces
 * whenever the commit *added* a key, e.g. a new notebook cell under
 * `cellContents`) only via the patch to `@automerge/automerge` in this
 * package's `patches/` — upstream automerge/automerge#1308. Without that
 * patch `applyPatches` throws `RangeError: index is not a number for patch`
 * on such a delete.
 */
export const undoDocHandleCommit = <T>(docHandle: DocHandle<T>, commit: Commit<Heads>): void => {
    const inverse = diff(docHandle.doc(), commit.after, commit.before);
    docHandle.change((doc) => {
        applyPatches(doc, inverse);
    });
};
