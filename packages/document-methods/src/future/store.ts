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
     * Fetch the handle a link `_id` refers to, or `undefined` if the store does
     * not know it. The referenced document is read off the handle with
     * {@link viewDocument}, the inverse of {@link linkForHandle}.
     *
     * This is half of the store's contribution to resolution: validation's
     * recursive elaborator (see {@link resolveModelInStore}) walks a model's
     * instantiations by calling `getHandle` for each referenced id, viewing its
     * document, then elaborating each against the core theory found by
     * {@link coreTheoryFor}. Because `validate` resolves a notebook's *own* model
     * by minting a link to its handle (via {@link linkForHandle}), a store over
     * validatable notebooks must be able to return the handle for that link too.
     */
    getHandle(id: string): Handle | undefined;
    /**
     * The core theory a document's `theory` id elaborates against, or
     * `undefined` if the store has no theory registered for it.
     *
     * The other half of resolution: each document fetched via {@link getHandle}
     * is elaborated against the core theory returned here for its `theory` id. A
     * document whose theory has no registered core theory cannot be resolved, so
     * the notebook whose `validate` triggered resolution reports `Illformed`.
     */
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
 * The shared recursive elaborator behind validation. Given a store and a link,
 * it fetches the handle (via {@link DocumentStore.getHandle}) and views its
 * document, recursively resolves the document's own instantiations (so it
 * elaborates against a populated map, not an empty one), elaborates against the
 * document's core
 * theory (via {@link DocumentStore.coreTheoryFor}), and detects cycles. Stores
 * differ only in how they fetch documents and look up core theories, so this is
 * the single place resolution lives — `validate` delegates here rather than the
 * reverse.
 *
 * It returns the elaborated {@link DblModel} without running `model.validate()`:
 * the `Valid`/`Invalid` distinction is made by the top-level
 * {@link Notebook.validate}, not by resolution. It rejects when a referenced
 * document is unavailable, has no registered core theory, fails to elaborate, or
 * participates in a cycle; the notebook whose `validate` triggered resolution
 * then reports `Illformed`.
 *
 * The cache of elaborated models and the in-progress set are created fresh for
 * each top-level call and threaded through the recursion, so they dedupe within
 * a single resolution tree (a diamond of instantiations elaborates each model
 * once) but never persist across calls: a later `validate` always re-elaborates
 * against the current document, never a model staled by an intervening edit.
 */
export async function resolveModelInStore<Handle>(
    store: DocumentStore<Handle>,
    link: Link,
): Promise<DblModel> {
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
        const handle = store.getHandle(link._id);
        if (handle === undefined) {
            throw new Error(`unknown model ${link._id}`);
        }
        const doc = store.viewDocument(handle) as ModelDocument;
        const coreTheory = store.coreTheoryFor(doc.theory);
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
    getHandle: (id) => plainDocumentsById.get(id),
    coreTheoryFor: (theory) => plainCoreTheories.get(theory),
};
