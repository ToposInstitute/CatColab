import type { Document } from "catcolab-document-types";
import type { Issue } from "../result";
import { getDocumentSnapshot, type DocumentStore } from "./document-store";
import { validateDocumentStructure } from "./structural-validation";

/* A per-handle cache over a document store.

The cache subscribes to the store once and bumps a generation counter whenever
the document changes, from any source: local edits, commits, reverts, or
remote sync. Derived data (snapshots, structural validation, indexes, and any
consumer-supplied computations) is recomputed lazily, at most once per
generation, so operations can read validated data without re-deriving or
re-checking it on every access. */

/** A cache of data derived from one document, invalidated on every change. */
export interface DocumentCache {
    /** Monotonic counter, bumped whenever the document changes. */
    generation(): number;
    /** The store's current (possibly proxied) view of the document. */
    view(): Readonly<Document>;
    /** An unproxied snapshot, computed at most once per generation.

    The snapshot is shared: callers must not mutate it. */
    snapshot(): Readonly<Document>;
    /** Structural validation of the document, computed at most once per
    generation. Empty when the document is well-formed. */
    structuralIssues(): ReadonlyArray<Issue>;
    /** The view, typed, when the document is structurally valid and of the
    given type; `undefined` otherwise. */
    tryDocument<T extends Document["type"]>(
        type: T,
    ): Readonly<Extract<Document, { type: T }>> | undefined;
    /** For structurally valid model documents: a map from generator
    (judgment) id to the id of the cell declaring it, in cell order. Computed
    at most once per generation. `undefined` when the document is not a
    structurally valid model document. */
    generatorIndex(): ReadonlyMap<string, string> | undefined;
    /** Memoize a computation under `key` for the current generation. The
    computation reruns the first time it is requested after a change. */
    memo<T>(key: unknown, compute: () => T): T;
    /** Subscribe to invalidation. Returns a function to unsubscribe. */
    onInvalidate(callback: () => void): () => void;
}

const snapshotKey = Symbol("document-cache snapshot");
const structureKey = Symbol("document-cache structure");
const generatorIndexKey = Symbol("document-cache generator index");

/** Create a document cache over a handle.

Prefer [`documentCacheFor`], which shares one cache (and one store
subscription) per handle. */
export function createDocumentCache<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): DocumentCache {
    let generation = 0;
    const memoEntries = new Map<unknown, { generation: number; value: unknown }>();
    const invalidateListeners = new Set<() => void>();

    store.subscribe(handle, () => {
        generation += 1;
        memoEntries.clear();
        for (const listener of Array.from(invalidateListeners)) {
            listener();
        }
    });

    const cache: DocumentCache = {
        generation: () => generation,
        view: () => store.getDocumentView(handle),
        snapshot: () => cache.memo(snapshotKey, () => getDocumentSnapshot(store, handle)),
        structuralIssues: () =>
            cache.memo(structureKey, () =>
                validateDocumentStructure(store.getDocumentView(handle)),
            ),
        tryDocument<T extends Document["type"]>(type: T) {
            if (cache.structuralIssues().length > 0) {
                return undefined;
            }
            const document = store.getDocumentView(handle);
            if (document.type !== type) {
                return undefined;
            }
            return document as Readonly<Extract<Document, { type: T }>>;
        },
        generatorIndex() {
            const document = cache.tryDocument("model");
            if (document === undefined) {
                return undefined;
            }
            return cache.memo(generatorIndexKey, () => {
                const index = new Map<string, string>();
                for (const cellId of document.notebook.cellOrder) {
                    const cell = document.notebook.cellContents[cellId];
                    if (cell?.tag === "formal" && !index.has(cell.content.id)) {
                        index.set(cell.content.id, cellId);
                    }
                }
                return index;
            });
        },
        memo<T>(key: unknown, compute: () => T): T {
            const entry = memoEntries.get(key);
            if (entry !== undefined && entry.generation === generation) {
                return entry.value as T;
            }
            const value = compute();
            memoEntries.set(key, { generation, value });
            return value;
        },
        onInvalidate(callback) {
            invalidateListeners.add(callback);
            return () => {
                invalidateListeners.delete(callback);
            };
        },
    };
    return cache;
}

interface CacheRegistry {
    /** Caches for object handles, weakly held so drafts can be collected. */
    objectHandles: WeakMap<object, DocumentCache>;
    /** Caches for primitive handles (none of the current stores use them). */
    otherHandles: Map<unknown, DocumentCache>;
}

const registriesByStore = new WeakMap<object, CacheRegistry>();

/** The shared document cache for a handle.

All consumers of the same handle (notebooks, cells, instances, validators)
share one cache and one store subscription. */
export function documentCacheFor<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): DocumentCache {
    let registry = registriesByStore.get(store);
    if (registry === undefined) {
        registry = { objectHandles: new WeakMap(), otherHandles: new Map() };
        registriesByStore.set(store, registry);
    }
    if ((typeof handle === "object" && handle !== null) || typeof handle === "function") {
        let cache = registry.objectHandles.get(handle);
        if (cache === undefined) {
            cache = createDocumentCache(store, handle);
            registry.objectHandles.set(handle, cache);
        }
        return cache;
    }
    let cache = registry.otherHandles.get(handle);
    if (cache === undefined) {
        cache = createDocumentCache(store, handle);
        registry.otherHandles.set(handle, cache);
    }
    return cache;
}
