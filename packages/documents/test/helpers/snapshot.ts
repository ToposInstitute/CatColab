import { toJS } from "@automerge/automerge";

import type { Document } from "catcolab-document-types";
import { createDocumentSnapshot as cloneSnapshot } from "../../src/document-store/in-memory";
import type { DeepReadonly } from "../../src/util/deep-readonly";

const snapshots = new WeakMap<Readonly<Document>, DeepReadonly<Document>>();

/** Snapshot a stored document for use as a store's `getDocumentSnapshot`.
 * Materializes the document off the Automerge backend and memoizes the result
 * by document identity, so repeated unchanged reads return the same snapshot
 * object, mirroring the snapshot semantics of the in-memory store. */
export function getDocumentSnapshot(document: Readonly<Document>): DeepReadonly<Document> {
    let snapshot = snapshots.get(document);
    if (snapshot === undefined) {
        snapshot = cloneSnapshot(toJS<Document>(document as Document));
        snapshots.set(document, snapshot);
    }
    return snapshot;
}
