import { toJS } from "@automerge/automerge";

import type { Document } from "catcolab-document-types";
import { createDocumentSnapshot, type DocumentSnapshot } from "catcolab-documents";

const snapshots = new WeakMap<Readonly<Document>, DocumentSnapshot>();

/** Snapshot a stored document for use as a store's `getDocumentSnapshot`.
 * Materializes the document off the Automerge backend and memoizes the result
 * by document identity, so repeated unchanged reads return the same snapshot
 * object, mirroring the snapshot semantics of the in-memory store. */
export function getDocumentSnapshot(document: Readonly<Document>): DocumentSnapshot {
    let snapshot = snapshots.get(document);
    if (snapshot === undefined) {
        snapshot = createDocumentSnapshot(toJS<Document>(document as Document));
        snapshots.set(document, snapshot);
    }
    return snapshot;
}
