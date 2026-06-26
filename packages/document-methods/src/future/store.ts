import { v7 } from "uuid";

import type { Document, Link } from "catcolab-document-types";
import type { DblModel } from "catlog-wasm";
import type { ModelValidationResult, ValidatableNotebook } from "./definitions";

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
     * Resolve an instantiation link to its elaborated, validated model.
     *
     * Validation and migration need the elaborated model of every model an
     * instantiation cell references. Resolution is inherently asynchronous (the
     * referenced document may live in a repo or on a server) and is the store's
     * responsibility, including fetching the document, elaborating it against
     * its own theory, and detecting cycles of instantiations. A store that
     * cannot resolve a given link rejects the returned promise; a notebook
     * containing such an instantiation then validates as `Illformed`. The
     * promise also rejects when the referenced model is unavailable or itself
     * ill-formed.
     */
    resolveModel(link: Link): Promise<DblModel>;
    /**
     * Resolve an `analysis-of` link to a validatable notebook for the analyzed
     * document, so an analysis cell's `run` can elaborate and validate it.
     *
     * An analysis document references the document it analyzes by an
     * `analysis-of` {@link Link} rather than by holding the notebook directly;
     * resolution fetches that document through the store and rebuilds an
     * interactive, validatable notebook over it. Resolution is asynchronous (the
     * referenced document may live in a repo or on a server). A store that
     * cannot resolve a given link rejects the returned promise.
     */
    resolveAnalysis(link: Link): Promise<ValidatableNotebook>;
}

const plainDocumentIds = new WeakMap<Document, string>();

export const plainDocumentId = (document: Document): string => {
    let id = plainDocumentIds.get(document);
    if (!id) {
        id = v7();
        plainDocumentIds.set(document, id);
    }
    return id;
};

/**
 * Elaborated models the plain store has seen, keyed by {@link plainDocumentId}.
 * The plain store has no theory of its own; instead {@link Notebook.validate}
 * (which does have a core theory) populates this cache as a side effect, so a
 * model that has already been elaborated locally can be resolved without
 * re-elaborating it.
 */
const plainElaboratedModels = new Map<string, DblModel>();

/**
 * The `validate` thunk of every notebook the plain store has attached, keyed by
 * {@link plainDocumentId}. A model that has not yet been elaborated is resolved
 * by running its own notebook's validation (which elaborates it against the
 * shape's core theory and caches the result in {@link plainElaboratedModels}).
 */
export const plainNotebookValidators = new Map<string, () => Promise<ModelValidationResult>>();

/** Ids whose resolution is in progress, used to detect cyclic instantiations. */
const plainResolving = new Set<string>();

/**
 * The validatable notebook of every model the plain store has attached, keyed
 * by {@link plainDocumentId}. An analysis document resolves the model it
 * analyzes (referenced by an `analysis-of` link) by looking it up here, so a
 * model created locally can be re-attached and validated without a closure.
 */
const plainAnalyzableNotebooks = new Map<string, ValidatableNotebook>();

/** Record an elaborated model for a plain-store handle; see {@link plainElaboratedModels}. */
export const cachePlainModel = (handle: Document, model: DblModel): void => {
    plainElaboratedModels.set(plainDocumentId(handle), model);
};

/** Record a validatable notebook for a plain-store handle; see {@link plainAnalyzableNotebooks}. */
export const cachePlainAnalyzable = (handle: Document, notebook: ValidatableNotebook): void => {
    plainAnalyzableNotebooks.set(plainDocumentId(handle), notebook);
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
    resolveModel: async (link) => {
        const cached = plainElaboratedModels.get(link._id);
        if (cached) {
            return cached;
        }
        const validate = plainNotebookValidators.get(link._id);
        if (!validate) {
            throw new Error(
                "The plain in-memory store cannot resolve a model for a document " +
                    "it did not create.",
            );
        }
        if (plainResolving.has(link._id)) {
            throw new Error(`Cyclic instantiation detected while resolving model ${link._id}.`);
        }
        plainResolving.add(link._id);
        try {
            const result = await validate();
            if (result.tag === "Illformed") {
                throw new Error(result.error);
            }
            return result.model;
        } finally {
            plainResolving.delete(link._id);
        }
    },
    resolveAnalysis: async (link) => {
        const notebook = plainAnalyzableNotebooks.get(link._id);
        if (!notebook) {
            throw new Error(
                "The plain in-memory store cannot resolve the analyzed model for a " +
                    "document it did not create.",
            );
        }
        return notebook;
    },
};
