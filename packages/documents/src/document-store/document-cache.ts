import type { Document } from "catcolab-document-types";
import type { Issue } from "../result";
import { getDocumentSnapshot, type DocumentStore } from "./document-store";
import { validateDocumentStructure } from "./structural-validation";

/* A per-handle cache over a document store.

The cache subscribes to the store once and bumps a generation counter
whenever the document changes, from any source: local edits, commits,
reverts, or remote sync. Derived data is recomputed lazily, at most once per
generation. */

/** Cached data derived from one document, recomputed after every change. */
export interface DocumentCache {
    /** Monotonic counter, bumped whenever the document changes. */
    generation(): number;
    /** An unproxied snapshot, computed at most once per generation.

    The snapshot is shared: callers must not mutate it. */
    snapshot(): Readonly<Document>;
    /** Structural validation of the document, computed at most once per
    generation. Empty when the document is well-formed. */
    structuralIssues(): ReadonlyArray<Issue>;
}

type Cached<T> = { generation: number; value: T } | undefined;

function createDocumentCache<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): DocumentCache {
    let generation = 0;
    let snapshot: Cached<Readonly<Document>>;
    let issues: Cached<ReadonlyArray<Issue>>;

    store.subscribe(handle, () => {
        generation += 1;
    });

    return {
        generation: () => generation,
        snapshot() {
            if (snapshot === undefined || snapshot.generation !== generation) {
                snapshot = { generation, value: getDocumentSnapshot(store, handle) };
            }
            return snapshot.value;
        },
        structuralIssues() {
            if (issues === undefined || issues.generation !== generation) {
                issues = {
                    generation,
                    value: validateDocumentStructure(store.getDocumentView(handle)),
                };
            }
            return issues.value;
        },
    };
}

const cachesByStore = new WeakMap<object, WeakMap<object, DocumentCache>>();

/** The shared document cache for a handle.

All consumers of the same handle share one cache and one store subscription.
Caches are held weakly, so they are collected with their handles. (Handles
are assumed to be objects, as they are in every store implementation.) */
export function documentCacheFor<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): DocumentCache {
    let caches = cachesByStore.get(store);
    if (caches === undefined) {
        caches = new WeakMap();
        cachesByStore.set(store, caches);
    }
    const key = handle as object;
    let cache = caches.get(key);
    if (cache === undefined) {
        cache = createDocumentCache(store, handle);
        caches.set(key, cache);
    }
    return cache;
}
