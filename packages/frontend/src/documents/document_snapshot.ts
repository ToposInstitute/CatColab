import { toJS } from "@automerge/automerge";

import type { Document } from "catcolab-document-types";
import {
    createDocumentSnapshot as createFrozenSnapshot,
    type DocumentSnapshot,
} from "catcolab-documents";

/**
 * Create a reader of immutable document snapshots from Automerge document
 * values.
 *
 * The returned reader materializes a plain, deeply frozen snapshot of each
 * document it is given, so that no Automerge proxy crosses the storage
 * boundary into framework code. Reads are cached by document: repeated reads
 * of an unchanged document return the same `DocumentSnapshot` object, while
 * each new document version yields a fresh snapshot that is never mutated
 * afterwards.
 */
export function createDocumentSnapshot(): (document: Readonly<Document>) => DocumentSnapshot {
    const snapshots = new WeakMap<Readonly<Document>, DocumentSnapshot>();
    return (document) => {
        let snapshot = snapshots.get(document);
        if (snapshot === undefined) {
            snapshot = createFrozenSnapshot(toJS<Document>(document));
            snapshots.set(document, snapshot);
        }
        return snapshot;
    };
}
