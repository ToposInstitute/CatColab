import type { Document, Link, ModelJudgment } from "catcolab-document-types";
import {
    type DblModel,
    DblModelMap,
    type DblTheory,
    elaborateModel,
    type ModelNotebook as WasmModelNotebook,
} from "catlog-wasm";
import type { ModelDocument } from "./model-document";
import type { DocumentStore } from "./store";

/**
 * A persistent, per-store cache of elaborated models, shared by every consumer
 * of {@link resolveModelInStore}: `Notebook.validate`, `migrateTo`, diagram and
 * instance validation, and analysis `run()`. Without it each call re-elaborates
 * the whole instantiation tree — an analysis notebook with N cells does N full
 * wasm elaborations of the same unchanged model.
 *
 * ## Invalidation
 *
 * Invalidation is a per-document *version counter* with a *signature re-check
 * on dirty*. The cache subscribes (once per document, via
 * {@link DocumentStore.subscribe}) and bumps the document's `version` on every
 * change notification — including remote changes where the store has them, e.g.
 * an Automerge `DocHandle`'s change event for a collaborator's edit. The
 * counter is purely local ("has *this client's* view possibly changed?"), so it
 * needs no synchronization between peers.
 *
 * Change notifications are noisy — a rich-text keystroke bumps the version but
 * cannot affect elaboration — so a bump does not evict anything by itself. On
 * the next read, a dirty document's {@link formalCellsSignature} is recomputed
 * once and compared: only a *changed* signature advances the document's content
 * `stamp`. Cache entries record the stamps of every document in their
 * resolution subtree, captured *before* the documents are read, so freshness is
 * integer comparison and an edit racing a resolution in flight leaves the entry
 * stale (wasted work) rather than ever serving a model elaborated from content
 * the stamps don't describe.
 *
 * ## Lifecycle
 *
 * The cache lives as long as its store (see {@link modelCacheFor}); document
 * subscriptions are never dropped, so its footprint is bounded by the set of
 * documents ever resolved through it. Errors — unresolvable links, elaboration
 * failures, cycles — are never cached.
 */

/**
 * Thrown when a notebook instantiates itself, directly or through a chain of
 * other notebooks, so its model can never be resolved. Carries the cycle as a
 * `A → B → A` chain of the notebooks' names for a message the user can act on.
 */
export class CyclicInstantiationError extends Error {
    constructor(readonly cycle: string) {
        super(
            `Instantiation cycle detected: ${cycle}. ` +
                `A notebook cannot instantiate itself, directly or indirectly. ` +
                `To fix, remove one of the instantiations in this chain.`,
        );
        this.name = "CyclicInstantiationError";
    }
}

/**
 * A stable string capturing the document's *formal* cells — every cell except
 * rich text — in notebook order, including each cell's id and serialized
 * content. {@link Notebook.onChangeFormalContent} and the model cache compare
 * this signature across changes and react only when it differs, so adding,
 * removing, reordering, or editing a formal cell is reported, while a change
 * confined to rich text (or any other non-formal field) leaves it unchanged.
 * Content is included so a formal cell edited in place (e.g. renaming an
 * object) still re-reports.
 */
export const formalCellsSignature = (document: Document): string => {
    if (document.type === "instance") {
        // An instance document has no notebook: its formal content is its
        // tables of rows.
        return JSON.stringify(document.tables);
    }
    if (document.type === "llmconversation") {
        // Conversation documents also have no notebook. Their structured
        // content is the ordered interaction sequence.
        return JSON.stringify(document.interactions);
    }
    const parts: Array<string> = [];
    for (const cellId of document.notebook.cellOrder) {
        const cell = document.notebook.cellContents[cellId];
        if (cell?.tag === "formal") {
            parts.push(`${cellId}:${JSON.stringify(cell.content)}`);
        }
    }
    return parts.join("\u0000");
};

/** The instantiation links a model document references in its own notebook. */
const instantiationLinks = (doc: ModelDocument): Link[] => {
    const links: Link[] = [];
    for (const cellId of doc.notebook.cellOrder) {
        const cell = doc.notebook.cellContents[cellId];
        if (cell?.tag !== "formal") {
            continue;
        }
        const judgment = cell.content as ModelJudgment;
        if (judgment.tag === "instantiation" && judgment.model) {
            links.push(judgment.model);
        }
    }
    return links;
};

/** The persistent invalidation state of one document, keyed by its link id. */
type DocState<Handle> = {
    readonly handle: Handle;
    /** Bumped by the store's change notifications (local and remote). */
    version: number;
    /** The version at which {@link signature} was last computed. */
    verifiedVersion: number;
    /** Formal-content signature as of {@link verifiedVersion}. */
    signature: string;
    /** Content generation: advances only when the signature actually changes,
     * so a rich-text edit bumps the version but never the stamp. */
    stamp: number;
};

/** An elaborated model together with the content stamps of every document in
 * its resolution subtree (itself included), captured when elaboration began. */
type Resolved = {
    readonly model: DblModel;
    readonly stamps: ReadonlyMap<string, number>;
};

type Entry = {
    readonly promise: Promise<Resolved>;
    /** Whether {@link promise} has settled. A *pending* entry must not be
     * awaited by another call that is itself mid-production; see
     * {@link createModelCache}'s `resolveLink`. */
    settled: boolean;
    /** The fulfilled value, recorded on settlement so {@link ModelCache.depsOf}
     * can read the dependency set synchronously. */
    resolved?: Resolved;
};

/** Per-top-level-call resolution state: the ids currently being produced (for
 * cycle detection) and the chain of names (for a legible cycle message). These
 * are never shared across calls. */
type CallState = {
    readonly resolving: Set<string>;
    readonly path: { id: string; name: string }[];
};

export interface ModelCache {
    /**
     * Resolve a link to its elaborated {@link DblModel}, reusing a cached model
     * whenever the document and every document in its instantiation subtree
     * still have the formal content they were elaborated from. Concurrent
     * resolutions of the same document share one elaboration. Rejects — without
     * caching the failure — when a referenced document is unavailable, fails to
     * elaborate, or participates in a cycle.
     */
    resolve(link: Link, coreTheory: DblTheory): Promise<DblModel>;
    /**
     * Subscribe to change notifications for one document, by link id. The
     * callback fires on *every* reported change of that document — the same
     * (deliberately noisy) granularity as {@link DocumentStore.subscribe}; it is
     * not filtered by formal content, so consumers re-derive what they need
     * (typically by re-running a cached, and therefore cheap, validation).
     *
     * Only documents the cache has resolved have change subscriptions, so this
     * is meaningful only for ids obtained from {@link depsOf} (or the id of a
     * document that has itself been resolved). Returns an unsubscribe function.
     */
    onDocChange(id: string, callback: () => void): () => void;
    /**
     * The ids of every document the given document's cached model was built
     * from — itself and its transitive instantiations — or `undefined` when the
     * cache holds no settled resolution for it (never resolved, resolution
     * still in flight, or evicted). This is the dependency set a validation
     * observer subscribes to via {@link onDocChange}.
     */
    depsOf(id: string): ReadonlySet<string> | undefined;
}

function createModelCache<Handle>(store: DocumentStore<Handle>): ModelCache {
    const docs = new Map<string, DocState<Handle>>();
    const entries = new Map<string, Entry>();
    /** Per-document change listeners (see {@link ModelCache.onDocChange}),
     * notified from the store subscription right after the version bump. */
    const docListeners = new Map<string, Set<() => void>>();

    /**
     * Get-or-create the persistent state for a document. Creation subscribes to
     * the document's changes (the subscription is kept for the cache's — i.e.
     * the store's — lifetime) and takes the initial signature. `getHandle` is
     * asynchronous, so a concurrent creation may have raced ahead; the map is
     * re-checked after the await and the earlier state wins.
     */
    const docStateFor = async (link: Link): Promise<DocState<Handle> | undefined> => {
        const existing = docs.get(link._id);
        if (existing) {
            return existing;
        }
        const resolved = await store.getHandle({
            id: link._id,
            version: link._version,
            server: link._server,
        });
        if (resolved.tag === "Err") {
            return undefined;
        }
        const handle = resolved.content;
        const raced = docs.get(link._id);
        if (raced) {
            return raced;
        }
        const state: DocState<Handle> = {
            handle,
            version: 0,
            verifiedVersion: 0,
            signature: "",
            stamp: 0,
        };
        // Subscribe before the initial signature read: both are synchronous, so
        // no change can slip between them, and every later change is reported.
        store.subscribe(handle, () => {
            state.version += 1;
            // Snapshot so a listener may unsubscribe during notification.
            for (const listener of Array.from(docListeners.get(link._id) ?? [])) {
                listener();
            }
        });
        state.signature = formalCellsSignature(store.getDocumentView(state.handle));
        docs.set(link._id, state);
        return state;
    };

    /**
     * Re-verify a document's signature if changes were reported since the last
     * check, advancing its content stamp only when the formal content actually
     * differs. The version is captured before the read so a change landing
     * during it leaves the state dirty for the next check.
     */
    const refreshDocState = (state: DocState<Handle>): void => {
        if (state.version === state.verifiedVersion) {
            return;
        }
        const version = state.version;
        const signature = formalCellsSignature(store.getDocumentView(state.handle));
        if (signature !== state.signature) {
            state.signature = signature;
            state.stamp += 1;
        }
        state.verifiedVersion = version;
    };

    /** Whether every document a resolved model was built from still has the
     * content stamp captured at its elaboration. */
    const stampsFresh = (stamps: ReadonlyMap<string, number>): boolean => {
        for (const [id, stamp] of stamps) {
            const state = docs.get(id);
            if (!state) {
                return false;
            }
            refreshDocState(state);
            if (state.stamp !== stamp) {
                return false;
            }
        }
        return true;
    };

    /** A document's display name, or a short id fallback for an unnamed
     * document, for legible cycle messages. */
    const nameFor = async (link: Link): Promise<string> => {
        const state = await docStateFor(link);
        const name = state && (store.getDocumentView(state.handle) as ModelDocument).name;
        return name && name.length > 0 ? `"${name}"` : `model ${link._id}`;
    };

    /**
     * Elaborate a document afresh: fetch its state, capture its content stamp
     * *before* reading the document view, recursively resolve its own
     * instantiations (so it elaborates against a populated map), and elaborate
     * against `coreTheory`. `call.resolving` catches cycles. The returned
     * stamps are the union of the document's own stamp and every stamp its
     * children were built from, so an entry's freshness covers the whole
     * subtree — a grandchild edit invalidates the root even when the
     * intermediate documents are untouched.
     */
    const elaborate = async (
        link: Link,
        coreTheory: DblTheory,
        call: CallState,
    ): Promise<Resolved> => {
        const id = link._id;
        const state = await docStateFor(link);
        if (!state) {
            throw new Error(`unknown model ${id}`);
        }
        refreshDocState(state);
        // Capture the stamp before the reads below: an edit racing this
        // (asynchronous) elaboration then makes the entry immediately stale
        // rather than stamping fresh content stamps onto a mixed elaboration.
        const stamps = new Map<string, number>([[id, state.stamp]]);
        const doc = store.getDocumentView(state.handle) as ModelDocument;
        call.resolving.add(id);
        call.path.push({ id, name: await nameFor(link) });
        try {
            const instantiated = new DblModelMap();
            for (const childLink of instantiationLinks(doc)) {
                if (instantiated.has(childLink._id)) {
                    continue;
                }
                const child = await resolveLink(childLink, coreTheory, call);
                instantiated.set(childLink._id, child.model);
                for (const [depId, depStamp] of child.stamps) {
                    if (!stamps.has(depId)) {
                        stamps.set(depId, depStamp);
                    }
                }
            }
            const model = elaborateModel(
                doc.notebook as unknown as WasmModelNotebook,
                instantiated,
                coreTheory,
                id,
            );
            return { model, stamps };
        } finally {
            call.resolving.delete(id);
            call.path.pop();
        }
    };

    /**
     * Resolve a link through the cache: report cycles, reuse a fresh cached
     * entry, await an in-flight one, or elaborate afresh and install the entry.
     *
     * A call that is itself mid-production (`call.resolving` non-empty) must
     * *not* await a pending entry: that entry belongs to another, concurrent
     * call (within one call resolution is sequential, so an own pending entry's
     * id is always in `call.resolving` and is caught by the cycle check first),
     * and two calls concurrently producing mutually-instantiating documents
     * would await each other forever instead of reporting the cycle. Such a
     * call elaborates independently — its own cycle detection still applies —
     * and leaves the shared entry to its producer. Top-level awaits (empty
     * `resolving`) cannot deadlock, since producers never wait on them.
     */
    const resolveLink = async (
        link: Link,
        coreTheory: DblTheory,
        call: CallState,
    ): Promise<Resolved> => {
        const id = link._id;
        if (call.resolving.has(id)) {
            // Report the cycle as the chain of instantiations that closes it,
            // e.g. `"First" → "Second" → "First"`, so the user can see exactly
            // which notebooks instantiate each other.
            const start = call.path.findIndex((entry) => entry.id === id);
            const loop = [
                ...call.path.slice(start).map((entry) => entry.name),
                await nameFor(link),
            ];
            throw new CyclicInstantiationError(loop.join(" → "));
        }
        const existing = entries.get(id);
        if (existing) {
            if (!existing.settled && call.resolving.size > 0) {
                return elaborate(link, coreTheory, call);
            }
            let resolved: Resolved | undefined;
            try {
                resolved = await existing.promise;
            } catch {
                // A rejected resolution is never cached; the producer removes
                // the entry (below), and this caller resolves afresh.
                resolved = undefined;
            }
            if (resolved && stampsFresh(resolved.stamps)) {
                return resolved;
            }
            if (entries.get(id) === existing) {
                entries.delete(id);
            }
            // Re-enter: another caller may already have installed a fresh entry.
            return resolveLink(link, coreTheory, call);
        }
        const entry: Entry = { promise: elaborate(link, coreTheory, call), settled: false };
        entry.promise.then(
            (resolved) => {
                entry.settled = true;
                entry.resolved = resolved;
            },
            () => {
                entry.settled = true;
            },
        );
        entries.set(id, entry);
        try {
            return await entry.promise;
        } catch (e) {
            if (entries.get(id) === entry) {
                entries.delete(id);
            }
            throw e;
        }
    };

    return {
        async resolve(link: Link, coreTheory: DblTheory): Promise<DblModel> {
            const call: CallState = { resolving: new Set(), path: [] };
            const resolved = await resolveLink(link, coreTheory, call);
            return resolved.model;
        },
        onDocChange(id: string, callback: () => void): () => void {
            let listeners = docListeners.get(id);
            if (!listeners) {
                listeners = new Set();
                docListeners.set(id, listeners);
            }
            listeners.add(callback);
            return () => {
                listeners.delete(callback);
            };
        },
        depsOf(id: string): ReadonlySet<string> | undefined {
            const resolved = entries.get(id)?.resolved;
            return resolved && new Set(resolved.stamps.keys());
        },
    };
}

/**
 * The per-store cache registry. A `WeakMap` key is only object identity, so the
 * store object itself keys its cache; `Handle` is captured in the cache's
 * closures at construction (see {@link createModelCache}), so the cache's
 * public surface — and hence this map's value type — never mentions it. The
 * per-key correlation "cache's handle type = store's handle type" is tied
 * together at the single accessor {@link modelCacheFor}.
 */
const caches = new WeakMap<object, ModelCache>();

/** The model cache for a store, created on first use and GC'd with the store. */
export function modelCacheFor<Handle>(store: DocumentStore<Handle>): ModelCache {
    let cache = caches.get(store);
    if (!cache) {
        cache = createModelCache(store);
        caches.set(store, cache);
    }
    return cache;
}

/**
 * The memoized outcomes of {@link DblModel.validate}, keyed by model identity.
 * A cached model is stable while its cache entry is fresh, so its validation
 * outcome is stable too; a re-elaborated model is a new object and validates
 * anew. Weakly keyed, so outcomes are collected with their models.
 */
const validationOutcomes = new WeakMap<DblModel, ReturnType<DblModel["validate"]>>();

/** Run {@link DblModel.validate}, memoized per model object; see
 * {@link validationOutcomes}. */
export function validateModelCached(model: DblModel): ReturnType<DblModel["validate"]> {
    let outcome = validationOutcomes.get(model);
    if (!outcome) {
        outcome = model.validate();
        validationOutcomes.set(model, outcome);
    }
    return outcome;
}
