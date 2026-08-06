import { v7 } from "uuid";

import type { Document, Link } from "catcolab-document-types";
import type { DblModel, DblTheory } from "catlog-wasm";
import { modelCacheFor } from "./model-cache";
import type { Result } from "./validation";

export { CyclicInstantiationError, formalCellsSignature } from "./model-cache";

/**
 * A plain reference to a document: the sole reference type of this package's
 * public API. It identifies a document by `id`/`version`/`server`, without
 * saying *how* the document is referenced — that is the concern of the internal,
 * on-disk `Link` type (which additionally carries a link `type` and uses the
 * database field convention `_id`/`_version`/`_server`). A `DocumentRef` is what
 * {@link DocumentStore.getDocumentRef} returns and {@link DocumentStore.getHandle}
 * consumes; {@link linkFromRef}/{@link refFromLink} bridge to the internal `Link`
 * when building or reading document content.
 */
export interface DocumentRef {
    /** Unique identifier of the referenced document. */
    id: string;
    /** Version of the document, or `null` to track the head commit. */
    version: string | null;
    /** Server containing the document. Omit for a local/serverless reference. */
    server?: string;
}

/**
 * Build an internal document-content {@link Link} of the given type from a
 * {@link DocumentRef}, mapping the unprefixed fields onto the database-level
 * `_id`/`_version`/`_server`. Internal: `Link` is not part of the public API.
 */
export const linkFromRef = (ref: DocumentRef, type: Link["type"]): Link => ({
    _id: ref.id,
    _version: ref.version,
    _server: ref.server ?? "",
    type,
});

/**
 * Read an internal document-content {@link Link} as a public {@link DocumentRef},
 * dropping the link `type`. Internal: used to hand a document-content link's
 * target to {@link DocumentStore.getHandle}, which speaks `DocumentRef`.
 */
export const refFromLink = (link: Link): DocumentRef => ({
    id: link._id,
    version: link._version,
    server: link._server,
});

/**
 * A store-native reference to a rich-text cell's text, for binding an
 * incremental editor. A collaborative rich-text editor does not mutate text
 * through change functions: it binds directly to the store's underlying
 * document (e.g. `@automerge/prosemirror` takes an Automerge `DocHandle` plus
 * the path to the text object and emits per-keystroke splices). A ref carries
 * exactly that pair.
 *
 * `docHandle` is deliberately `unknown`: this package does not depend on any
 * particular store backend, and the consumer that constructed the store knows
 * the concrete handle type and narrows it (e.g. to `DocHandle<unknown>` for an
 * Automerge-backed store).
 */
export type RichTextRef = {
    /** The store's underlying document handle, e.g. an Automerge `DocHandle`. */
    readonly docHandle: unknown;
    /** Path from the document root to the cell's text object, e.g.
     * `["notebook", "cellContents", cellId, "content"]`. */
    readonly path: ReadonlyArray<string | number>;
};

/**
 * The span of document versions a committed draft covers: the store's version
 * of the document just before the draft was merged and just after. `Version`
 * is store-native — Automerge heads for an Automerge store, detached document
 * snapshots for the plain store — and opaque to consumers: a commit is only
 * ever passed back into {@link DocumentStore.revertCommit} of the store that
 * minted it.
 */
export interface Commit<Version> {
    before: Version;
    after: Version;
}

/**
 * A document store abstracts the storage that notebooks operate over. A
 * store is a stateless object working on handles of its own choosing: a
 * plain document, a Solid store, an Automerge `DocHandle`, etc. Handles are
 * produced by `createHandle` and passed back into the other methods.
 *
 * `Version` is the store-native document version type carried by a
 * {@link Commit} (e.g. Automerge `Heads`). It defaults to `unknown`, so a
 * store that omits the optional draft/commit methods need not name one.
 */
export interface DocumentStore<Handle, Version = unknown> {
    /**
     * Initialize a store handle from an initial document. Asynchronous so a
     * store backed by a remote backend can register the document as it is
     * created — e.g. push the content over RPC and resolve the returned ref to
     * a handle. In-memory stores simply resolve immediately.
     */
    createHandle(initialDoc: Document): Promise<Handle>;
    /**
     * Get the read view of the document for a handle (reactive where
     * applicable). This is a plain getter: it must be cheap and return a stable
     * object across calls, so a store that projects its handle (e.g. Automerge +
     * `makeDocumentProjection`) builds the projection once in
     * {@link createHandle} (and {@link getHandle}) and simply returns it here,
     * rather than rebuilding it per read. The view is read-only: mutations go
     * through {@link changeDocument}, not by writing to the returned document.
     */
    getDocumentView(handle: Handle): Readonly<Document>;
    /** Apply a mutation by mutating a draft document. */
    changeDocument(handle: Handle, fn: (doc: Document) => void): void;
    /**
     * Clone the document behind a handle into a private *draft* handle. A
     * draft is a full handle — every store method works on it — but its
     * mutations stay invisible to the source document until the draft is
     * merged back with {@link commitDraft}. This is the storage half of a
     * notebook transaction (see `Notebook.beginTransaction`).
     *
     * Optional: a store that omits it (together with {@link commitDraft} and
     * {@link revertCommit}) does not support transactions, and
     * `Notebook.beginTransaction` throws.
     */
    createDraft?(handle: Handle): Handle;
    /**
     * Merge a draft (made by {@link createDraft} from the same handle) back
     * into its source document, returning the {@link Commit} spanning the
     * source document's version just before and just after the merge. The
     * commit is the token to undo the transaction with {@link revertCommit};
     * the draft is dead once committed.
     */
    commitDraft?(handle: Handle, draft: Handle): Commit<Version>;
    /**
     * Undo a commit's effects, as a *new* change to the document. A CRDT
     * store applies the inverse diff of the commit's span (so edits made
     * after the commit survive); a snapshot store may instead roll the
     * document back to the commit's `before` version.
     */
    revertCommit?(handle: Handle, commit: Commit<Version>): void;
    /**
     * The store-native reference an incremental rich-text editor binds to, when
     * the store can provide one. An Automerge-backed store returns its
     * `DocHandle` plus the path to the cell's text object, so an editor (e.g.
     * `@automerge/prosemirror`) can emit per-keystroke splices that preserve
     * text-object merge semantics. Stores that omit this (e.g. the plain
     * in-memory store) cannot bind an incremental editor: rich text is then
     * replace-only, through {@link changeDocument}.
     */
    getRichTextRef?(handle: Handle, cellId: string): RichTextRef | undefined;
    /**
     * Subscribe to changes of the document behind a handle, including remote
     * changes — e.g. another collaborator editing a shared Automerge document.
     * The callback takes no arguments: it is a pure notification, so a consumer
     * re-reads whatever notebook state it cares about. Returns an unsubscribe
     * function that removes the listener.
     *
     * A store with no asynchronous or remote change source (the plain in-memory
     * store, a bare Solid store) still implements it to report local mutations
     * made through {@link changeDocument}, typically by notifying a set of
     * listeners after applying the mutation.
     */
    subscribe(handle: Handle, callback: () => void): () => void;
    /** Make a detached plain-JS copy of a store-owned value before cloning it. */
    copyValue<T>(handle: Handle, value: T): T;
    /**
     * Convert a store handle into the referenced document's {@link DocumentRef}.
     * Every store must mint a stable reference for its handles — an in-memory
     * store assigns one at {@link createHandle} time (see {@link plainStore}) —
     * so `validate`, instantiation, and cross-document loading always have a
     * reference to resolve. The inverse of {@link getHandle}.
     */
    getDocumentRef(handle: Handle): DocumentRef;
    /**
     * Fetch the handle a {@link DocumentRef} refers to as a {@link Result}: an
     * `Ok` carrying the handle, or an `Err` carrying issues when the store cannot
     * resolve the reference (e.g. it does not know the id, or a backend fetch
     * failed). The referenced document is read off the handle with
     * {@link getDocumentView}. The inverse of {@link getDocumentRef}.
     *
     * This is the store's contribution to resolution: validation's recursive
     * elaborator (see {@link resolveModelInStore}) walks a model's
     * instantiations by calling `getHandle` for each referenced document and
     * viewing its document, then elaborates each against the host notebook's core
     * theory (supplied by the caller, since every instantiation in a notebook is
     * validatable against that one core theory). Because `validate` resolves a
     * notebook's *own* model by taking a reference to its handle (via
     * {@link getDocumentRef}), a store over validatable notebooks must be able to
     * return the handle for that reference too.
     *
     * Asynchronous so a store backed by a remote backend can fetch the document
     * — e.g. resolve a reference to an Automerge document over RPC, then load it
     * from the repo. In-memory stores simply resolve immediately.
     */
    getHandle(ref: DocumentRef): Promise<Result<Handle>>;
}

/**
 * The shared recursive elaborator behind validation. Given a store, a link, and
 * the core theory to elaborate against, it fetches the handle (via
 * {@link DocumentStore.getHandle}) and views its document, recursively resolves
 * the document's own instantiations (so it elaborates against a populated map,
 * not an empty one), elaborates against `coreTheory`, and detects cycles. Every
 * instantiation in a notebook is validatable against the host's core theory, so
 * the same `coreTheory` is threaded through the whole resolution tree rather
 * than looked up per document. Stores differ only in how they fetch documents,
 * so this is the single place resolution lives — `validate` delegates here
 * rather than the reverse.
 *
 * It returns the elaborated {@link DblModel} without running `model.validate()`:
 * the `Valid`/`Invalid` distinction is made by the top-level
 * {@link Notebook.validate}, not by resolution. It rejects when a referenced
 * document is unavailable, fails to elaborate, or participates in a cycle; the
 * notebook whose `validate` triggered resolution then reports `Illformed`.
 *
 * Resolution is cached per store: an elaborated model is reused across calls —
 * by `validate`, `migrateTo`, diagram and instance validation, and analysis
 * `run()` alike — until the formal content of its document, or of any document
 * in its instantiation subtree, actually changes. Failures are never cached.
 * See {@link modelCacheFor} for the invalidation strategy.
 */
export function resolveModelInStore<Handle>(
    store: DocumentStore<Handle>,
    ref: DocumentRef,
    coreTheory: DblTheory,
): Promise<DblModel> {
    // Resolution only ever follows a document reference as an instantiation, so
    // the internal cache key is the corresponding instantiation link.
    return modelCacheFor(store).resolve(linkFromRef(ref, "instantiation"), coreTheory);
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
 * Change listeners registered against plain-store documents. The plain store has
 * no remote change source, so the only changes it can report are the local
 * mutations made through {@link plainStore.changeDocument}, which notifies every
 * listener registered for that document after applying the mutation.
 */
const plainChangeListeners = new WeakMap<Document, Set<() => void>>();

/**
 * Replace a plain-store document's contents in place with a detached copy of
 * `contents`, through {@link plainStore.changeDocument} so listeners fire.
 * Used by the plain store's draft/commit methods, which work on whole-document
 * snapshots.
 */
const plainReplaceDocument = (handle: Document, contents: Document): void => {
    plainStore.changeDocument(handle, (doc) => {
        for (const key of Object.keys(doc)) {
            delete (doc as unknown as Record<string, unknown>)[key];
        }
        Object.assign(doc, structuredClone(contents));
    });
};

/**
 * A plain in-memory store whose handle is the document itself. Its `Version`
 * is a detached snapshot of the whole document, so {@link plainStore.revertCommit}
 * is a *rollback* to the commit's `before` snapshot — unlike a CRDT store's
 * inverse diff, it discards edits made after the commit.
 */
export const plainStore: DocumentStore<Document, Document> = {
    createHandle: async (initialDoc) => {
        plainDocumentId(initialDoc);
        return initialDoc;
    },
    getHandle: async (ref) => {
        const handle = plainDocumentsById.get(ref.id);
        return handle
            ? { tag: "Ok", content: handle }
            : {
                  tag: "Err",
                  content: [{ message: `Cannot resolve reference "${ref.id}".`, path: ["id"] }],
              };
    },
    getDocumentView: (handle) => handle,
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
    createDraft: (handle) => structuredClone(handle),
    commitDraft: (handle, draft) => {
        const before = structuredClone(handle);
        plainReplaceDocument(handle, draft);
        const after = structuredClone(handle);
        return { before, after };
    },
    revertCommit: (handle, commit) => {
        plainReplaceDocument(handle, commit.before);
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
    getDocumentRef: (handle) => ({
        id: plainDocumentId(handle),
        version: null,
        server: "",
    }),
};
