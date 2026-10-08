import { type Accessor, createComputed, createSignal, onCleanup, untrack } from "solid-js";
import { createStore, reconcile, type Store } from "solid-js/store";

import type { DocumentSnapshot, DocumentStore } from "catcolab-documents";
import { requireOwner } from "../../src/require_owner";

type ChangeSource = { onChange(callback: () => void): () => void };
type Source = ChangeSource | Accessor<ChangeSource>;

/** Translate the explicit storage subscription into a Solid dependency. */
export function createDocumentAccessor<H, V>(
    store: DocumentStore<H, V>,
    handle: H,
): Accessor<DocumentSnapshot> {
    requireOwner();
    const [snapshot, setSnapshot] = createSignal(store.getDocumentSnapshot(handle));
    const stop = store.subscribe(handle, () => {
        // Read latest so reentrant notifications cannot regress the UI.
        setSnapshot(store.getDocumentSnapshot(handle));
    });
    onCleanup(stop);
    return snapshot;
}

/** Explicitly observe a selector over a command facade's current reads.
 * Core getters themselves do not register reactive dependencies. */
export function createDocumentSelector<T>(source: Source, select: () => T): Accessor<T> {
    requireOwner();
    const [revision, setRevision] = createSignal(0);
    createComputed(() => {
        const current = typeof source === "function" ? source() : source;
        setRevision((value) => value + 1);
        onCleanup(current.onChange(() => setRevision((value) => value + 1)));
    });
    return () => {
        revision();
        return select();
    };
}

/** Reconcile derived or non-Automerge snapshot data into a frontend-owned projection.
 * Unlike createDocumentView, this clones/reconciles selected data on each change. IDs retain
 * object identity across versions; unrelated fields do not invalidate their
 * readers. Select data only, not command facades containing functions. */
export function createDocumentStore<T extends object>(source: Source, select: () => T): Store<T> {
    const selected = createDocumentSelector(source, select);
    const [view, setView] = createStore<T>(structuredClone(untrack(selected)));
    createComputed(() => {
        const value = structuredClone(selected());
        untrack(() => setView(reconcile(value, { key: "id" })));
    });
    return view;
}
