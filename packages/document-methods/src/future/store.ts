import { v7 } from "uuid";

import type { Document, Link, ModelJudgment } from "catcolab-document-types";
import {
    type DblModel,
    DblModelMap,
    type DblTheory,
    elaborateModel,
    type ModelNotebook as WasmModelNotebook,
} from "catlog-wasm";
import type { ModelDocument } from "../model";

/**
 * A document store abstracts the storage that notebooks operate over. A
 * store is a stateless object working on handles of its own choosing: a
 * plain document, a Solid store, an Automerge `DocHandle`, etc. Handles are
 * produced by `createHandle` and passed back into the other methods.
 */
export interface DocumentStore<Handle> {
    /** Initialize a store handle from an initial document. */
    createHandle(initialDoc: Document): Handle;
    /** Read view of the document for a handle (reactive where applicable). */
    viewDocument(handle: Handle): Document;
    /** Apply a mutation by mutating a draft document. */
    changeDocument(handle: Handle, fn: (doc: Document) => void): void;
    /**
     * Subscribe to changes of the document behind a handle, including remote
     * changes — e.g. another collaborator editing a shared Automerge document.
     * The callback takes no arguments: it is a pure notification, so a consumer
     * re-reads whatever notebook state it cares about. Returns an unsubscribe
     * function that removes the listener.
     *
     * Optional: a store with no asynchronous or remote change source (the plain
     * in-memory store) may still implement it to report local mutations made
     * through the notebook, but a store that omits it leaves {@link
     * Notebook.onChange} a no-op subscription.
     */
    subscribe?(handle: Handle, callback: () => void): () => void;
    /** Make a detached plain-JS copy of a store-owned value before cloning it. */
    copyValue<T>(handle: Handle, value: T): T;
    /**
     * Convert a store handle into the referenced document's stable reference,
     * when available. The reference omits the link `type`: a handle only
     * identifies a document, not how it is being referenced, so the caller
     * supplies the `type` per the kind of link being created (e.g.
     * `"instantiation"`). Returns `undefined` when the handle has no stable
     * reference (e.g. a store that cannot mint links).
     */
    linkForHandle(handle: Handle): Omit<Link, "type"> | undefined;
    /**
     * Resolve a link to a model document into its elaborated model.
     *
     * This is the recursive workhorse of validation: a model's own
     * {@link Notebook.validate} resolves the model by minting a link to its own
     * handle and calling `resolveModel`, and each instantiation the model
     * references is resolved by `resolveModel` calling itself. Resolution is the
     * store's responsibility — fetching the referenced document, elaborating it
     * against its own core theory (looked up by the document's `theory` id),
     * recursively resolving the document's own instantiations, and detecting
     * cycles. It is inherently asynchronous (the document may live in a repo or
     * on a server).
     *
     * Because `validate` resolves a notebook's *own* model this way, a store
     * over validatable notebooks must be able to resolve the link minted by
     * {@link linkForHandle} for one of its own handles: `linkForHandle` must
     * return a link, and `resolveModel` must elaborate it. A store that cannot
     * resolve a given link rejects the returned promise; the notebook whose
     * `validate` triggered it then reports `Illformed`. The promise also rejects
     * when the document is unavailable, has no registered core theory, fails to
     * elaborate, or participates in a cycle.
     *
     * `resolveModel` returns the elaborated {@link DblModel} without running
     * `model.validate()`: the `Valid`/`Invalid` distinction is made by the
     * top-level {@link Notebook.validate}, not by resolution.
     */
    resolveModel(link: Link): Promise<DblModel>;
}

/**
 * The store-agnostic dependencies the shared resolver needs: how to fetch a
 * document by id and how to find a theory's core theory. The cache of
 * elaborated models and the in-progress set used for cycle detection are *not*
 * supplied — they are created fresh per top-level {@link resolveModelWith} call
 * and live only for that resolution tree, so every resolution re-elaborates
 * against the current document state (no stale cache survives an edit). See
 * {@link resolveModelWith}.
 */
export interface ResolverDeps {
    /** Fetch the model document for an id, or `undefined` if unknown. */
    getDocument(id: string): ModelDocument | undefined;
    /** The core theory a document's `theory` id elaborates against, if known. */
    coreTheoryFor(theory: string): DblTheory | undefined;
}

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

/**
 * The shared recursive elaborator behind every store's `resolveModel`. Given a
 * link, it fetches the document, recursively resolves the document's own
 * instantiations (so it elaborates against a populated map, not an empty one),
 * elaborates against the document's core theory, and detects cycles. Stores
 * differ only in {@link ResolverDeps}, so this is the single place resolution
 * lives — `validate` delegates here rather than the reverse.
 *
 * The cache of elaborated models and the in-progress set are created fresh for
 * each top-level call and threaded through the recursion, so they dedupe within
 * a single resolution tree (a diamond of instantiations elaborates each model
 * once) but never persist across calls: a later `validate` always re-elaborates
 * against the current document, never a model staled by an intervening edit.
 */
export async function resolveModelWith(deps: ResolverDeps, link: Link): Promise<DblModel> {
    // Per-resolution-tree state: dedupe within this call, persist across none.
    const cache = new Map<string, DblModel>();
    const resolving = new Set<string>();

    const resolve = async (link: Link): Promise<DblModel> => {
        const cached = cache.get(link._id);
        if (cached) {
            return cached;
        }
        if (resolving.has(link._id)) {
            throw new Error(`Cyclic instantiation detected while resolving model ${link._id}.`);
        }
        const doc = deps.getDocument(link._id);
        if (!doc) {
            throw new Error(`unknown model ${link._id}`);
        }
        const coreTheory = deps.coreTheoryFor(doc.theory);
        if (!coreTheory) {
            throw new Error(`No core theory registered for document theory "${doc.theory}".`);
        }
        resolving.add(link._id);
        try {
            // Recursively resolve the document's own instantiations so it
            // elaborates against a populated map; `resolving` catches cycles.
            const instantiated = new DblModelMap();
            for (const childLink of instantiationLinks(doc)) {
                if (!instantiated.has(childLink._id)) {
                    instantiated.set(childLink._id, await resolve(childLink));
                }
            }
            const model = elaborateModel(
                doc.notebook as unknown as WasmModelNotebook,
                instantiated,
                coreTheory,
                link._id,
            );
            cache.set(link._id, model);
            return model;
        } finally {
            resolving.delete(link._id);
        }
    };

    return resolve(link);
}

const plainDocumentIds = new WeakMap<Document, string>();

/** Reverse of {@link plainDocumentIds}: the document an id was minted for, so
 * the plain store's resolver can fetch a referenced document by id. */
const plainDocumentsById = new Map<string, Document>();

export const plainDocumentId = (document: Document): string => {
    let id = plainDocumentIds.get(document);
    if (!id) {
        id = v7();
        plainDocumentIds.set(document, id);
        plainDocumentsById.set(id, document);
    }
    return id;
};

/**
 * Core theories the plain store knows, keyed by a document's `theory` id. The
 * plain store has no theory of its own; instead {@link Notebook.validate} (which
 * does know its shape's `coreTheory`) registers it here via
 * {@link registerCoreTheory} before delegating resolution, so the shared
 * resolver can elaborate any document the store has attached.
 */
const plainCoreTheories = new Map<string, DblTheory>();

/**
 * Register a document's `theory` id with the core theory it elaborates against,
 * so the plain store's resolver can elaborate documents of that theory. Called
 * by {@link Notebook.validate}, which knows its shape's `coreTheory`.
 */
export const registerCoreTheory = (theory: string, coreTheory: DblTheory): void => {
    plainCoreTheories.set(theory, coreTheory);
};

/**
 * Change listeners registered against plain-store documents. The plain store has
 * no remote change source, so the only changes it can report are the local
 * mutations made through {@link plainStore.changeDocument}, which notifies every
 * listener registered for that document after applying the mutation.
 */
const plainChangeListeners = new WeakMap<Document, Set<() => void>>();

/** A plain in-memory store whose handle is the document itself. */
export const plainStore: DocumentStore<Document> = {
    createHandle: (initialDoc) => {
        plainDocumentId(initialDoc);
        return initialDoc;
    },
    viewDocument: (handle) => handle,
    changeDocument: (handle, fn) => {
        fn(handle);
        const listeners = plainChangeListeners.get(handle);
        if (listeners) {
            // Snapshot so a listener may unsubscribe during notification.
            for (const listener of Array.from(listeners)) {
                listener();
            }
        }
    },
    subscribe: (handle, callback) => {
        let listeners = plainChangeListeners.get(handle);
        if (!listeners) {
            listeners = new Set();
            plainChangeListeners.set(handle, listeners);
        }
        listeners.add(callback);
        return () => {
            listeners.delete(callback);
        };
    },
    copyValue: (_handle, value) => structuredClone(value),
    linkForHandle: (handle) => ({
        _id: plainDocumentId(handle),
        _version: null,
        _server: "",
    }),
    resolveModel: (link) =>
        resolveModelWith(
            {
                getDocument: (id) => plainDocumentsById.get(id) as ModelDocument | undefined,
                coreTheoryFor: (theory) => plainCoreTheories.get(theory),
            },
            link,
        ),
};
