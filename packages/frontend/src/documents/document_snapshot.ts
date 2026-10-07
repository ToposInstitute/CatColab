import { toJS } from "@automerge/automerge";

import type { Document } from "catcolab-document-types";
import type { DeepReadonly } from "catcolab-documents";

/**
 * Create a reader of immutable document snapshots from Automerge document
 * values.
 *
 * The returned reader materializes a plain, detached snapshot of each
 * document it is given, so that no Automerge proxy crosses the storage
 * boundary into framework code. Reads are cached by document: repeated reads
 * of an unchanged document return the same `DeepReadonly<Document>` object,
 * while each new document version yields a fresh snapshot that is never
 * mutated afterwards.
 */
export function createDocumentSnapshotReader(): (
    document: DeepReadonly<Document>,
) => DeepReadonly<Document> {
    const snapshots = new WeakMap<DeepReadonly<Document>, DeepReadonly<Document>>();
    return (document) => {
        let snapshot = snapshots.get(document);
        if (snapshot === undefined) {
            // `toJS` only reads, so the deep-readonly view is safe to pass.
            snapshot = toJS<Document>(document as Document);
            snapshots.set(document, snapshot);
        }
        return snapshot;
    };
}
