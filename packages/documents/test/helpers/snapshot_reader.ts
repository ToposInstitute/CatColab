import type { Document } from "catcolab-document-types";
import { createDocumentSnapshot, type DocumentSnapshot } from "catcolab-documents";

/** Adapt a store's handle to our need to have immutable snapshots of the
 * documents. Test utility mirroring the snapshot semantics of the in-memory
 * store: repeated unchanged reads return the same snapshot object. */
export function createSnapshotReader<Handle>(
    read: (handle: Handle) => Readonly<Document>,
    materialize: (document: Readonly<Document>) => Readonly<Document> = (document) => document,
): (handle: Handle) => DocumentSnapshot {
    const snapshots = new WeakMap<Readonly<Document>, DocumentSnapshot>();
    return (handle) => {
        const document = read(handle);
        let snapshot = snapshots.get(document);
        if (snapshot === undefined) {
            snapshot = createDocumentSnapshot(materialize(document));
            snapshots.set(document, snapshot);
        }
        return snapshot;
    };
}
