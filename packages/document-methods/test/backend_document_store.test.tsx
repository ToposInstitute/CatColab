// A full, production-shaped `DocumentStore` for the current frontend: Solid +
// Automerge for reactivity and local state, and a real backend client for
// `linkForHandle`/`getHandle`. This mirrors what the frontend's `Api` class
// (packages/frontend/src/api/types.ts) does today — resolve a document ref id
// to an Automerge `DocumentId` over RPC, then `repo.find` it — but expressed as
// the `DocumentStore<Handle>` abstraction from `catcolab-documents`.
//
// The store's `Handle` is an Automerge `DocHandle<ModelDocument>` bundled with
// the Solid projection built from it, exactly as
// `notebook_with_automerge_solid_component.lts.md` sketches. What this example
// adds over that sketch is the backend wiring: `linkForHandle` mints a stable
// `{ _id, _version, _server }` reference (the analog of `Api.makeUnversionedRef`)
// and `getHandle` walks a reference back to a handle by hitting the backend
// (the analog of `Api.getDocHandle` -> `rpc.get_doc.query` -> `repo.find`), so a
// notebook that instantiates another *backend* document can be validated.
//
// Everything the store needs is written out inline in `createBackendStore`
// below: there are no `makeHandle`/`materialize` helper functions and no
// `Handle`/store type aliases. Read `createBackendStore` top to bottom as the
// literal checklist of what someone integrating a real backend must supply for
// each `DocumentStore` method.
/* oxlint-disable unicorn/consistent-function-scoping */
import { getBackend, getObjectId } from "@automerge/automerge";
import { type DocHandle, type DocumentId, Repo } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import { createBinder, type DocumentStore, Instantiation, type Notebook } from "catcolab-documents";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createRoot, For } from "solid-js";
import { render } from "solid-js/web";
import { v7 } from "uuid";
import { describe, expect, test } from "vitest";

import type { ModelDocument } from "catcolab-document-methods";
import type { Document } from "catcolab-document-types";
import { DblModel } from "catlog-wasm";

// ---------------------------------------------------------------------------
// A stand-in for the CatColab backend, modelled on its real RPC surface.
//
// The production backend is reached through a Qubit RPC client (see
// packages/frontend/src/api/rpc.ts and the generated `QubitServer` type in
// packages/backend/pkg/src/index.ts). Every method returns an `RpcResult<T>`,
// a tagged `Ok`/`Err` union, and document reads come back as a `RefDoc`, a
// tagged `Live`/`Readonly` union. We reproduce those shapes here so the store
// below has to unwrap them exactly like `Api.fetchDocCacheEntry` does.
//
// The two methods the store actually uses:
//
//   * `new_ref(content)`: register a document under a fresh ref id, returning
//     the ref id (the `_id` of a `StableRef`). Analog of `rpc.new_ref.mutate`.
//   * `get_doc(refId)`: resolve a ref id to the Automerge document behind it.
//     Analog of `rpc.get_doc.query`, whose `docId` the frontend then `find`s.
//
// The backend holds its own networked `Repo` in production; here the store and
// backend share one in-memory `Repo`, and every registered document is served
// as `Live` (the store `find`s it by `docId`). The `Readonly` arm — where the
// backend ships document bytes to be imported into a local repo — is modelled
// too, so the store's unwrapping logic is complete, even though this fake only
// ever returns `Live`.
// ---------------------------------------------------------------------------
type RpcResult<T> = { tag: "Ok"; content: T } | { tag: "Err"; code: number; message: string };

type RefDoc =
    | { tag: "Live"; docId: string; isDeleted: boolean }
    | { tag: "Readonly"; binaryData: string; isDeleted: boolean };

class FakeBackend {
    readonly serverHost = "test.catcolab.org";

    /** The Automerge repo the backend serves documents out of. */
    readonly repo = new Repo();

    /** ref id -> Automerge document id, the mapping `get_doc` serves. */
    private readonly refs = new Map<string, DocumentId>();

    /**
     * Analog of `rpc.new_ref.mutate`: take document *content*, create the repo
     * document backend-side, and return the fresh ref id. This is what
     * `Api.createDoc` calls. The store below does not use it, because the
     * notebook binder has already created the handle locally with
     * `store.createHandle` (see `publish`); it is here as the canonical way a
     * brand-new document is registered.
     */
    async new_ref(content: Document): Promise<RpcResult<string>> {
        const handle = this.repo.create<ModelDocument>(content as ModelDocument);
        const refId = v7();
        this.refs.set(refId, handle.documentId);
        return { tag: "Ok", content: refId };
    }

    /**
     * Register an already-existing repo document under a fresh ref id. Because
     * the store and backend share one repo here, a handle the binder created
     * with `store.createHandle` already lives in the repo, so publishing it is
     * just minting a ref for its `docId`. In a networked deployment this would
     * instead push the document's content to the backend's own repo (i.e.
     * `new_ref`), and the ref would point at the backend-side `docId`.
     */
    async publish(docId: DocumentId): Promise<RpcResult<string>> {
        const refId = v7();
        this.refs.set(refId, docId);
        return { tag: "Ok", content: refId };
    }

    /** Analog of `rpc.get_doc.query`: ref id -> `RefDoc` (always `Live` here). */
    async get_doc(refId: string): Promise<RpcResult<RefDoc>> {
        const docId = this.refs.get(refId);
        if (!docId) {
            return { tag: "Err", code: 404, message: `Unknown document ${refId}` };
        }
        return { tag: "Ok", content: { tag: "Live", docId, isDeleted: false } };
    }
}

// ---------------------------------------------------------------------------
// The store.
//
// This is the whole integration surface for a backend-backed store. It builds a
// `DocumentStore<Handle>` where `Handle` is `{ automergeHandle, projection }`:
// an Automerge `DocHandle` plus the Solid projection made from it once, so that
// repeated `getReactiveProjection` reads reuse one projection. The store keeps a
// bidirectional cache between a handle's Automerge `DocumentId` and the backend
// ref id it was registered under, so `linkForHandle` can answer synchronously
// and `getHandle` can skip a round-trip for handles it has already resolved.
//
// The returned object additionally exposes `register`, which pushes a locally
// created handle to the backend (minting its ref id) — the notebook binder
// creates handles with `store.createHandle` before they exist on the server, so
// this is how a document becomes referenceable.
// ---------------------------------------------------------------------------
function createBackendStore(backend: FakeBackend) {
    const repo = backend.repo;

    // The store's handle: an Automerge `DocHandle` for local/remote state, plus
    // the Solid projection built from it once (so repeated reactive reads reuse
    // one projection). Declaring the handle shape is the one unavoidable step of
    // any `DocumentStore` integration — every method below takes or returns it.
    type Handle = { automergeHandle: DocHandle<ModelDocument>; projection: ModelDocument };

    // handle document id <-> backend ref id, and ref id -> minted handle so a
    // ref resolves to one stable handle (and one projection) per store.
    const refByDocId = new Map<DocumentId, string>();
    const handleByRefId = new Map<string, Handle>();

    // Annotated as `DocumentStore<Handle>` (plus `register`) so all methods
    // share the one handle type and the store is checked against the interface
    // as it is written, not after the fact.
    const store: DocumentStore<Handle> & { register(handle: Handle): Promise<string> } = {
        // Local creation: a fresh Automerge document, projected once. It is not
        // on the backend until `register` (or a notebook's own linking flow)
        // pushes it, so it has no stable ref yet — exactly like a document the
        // user just made. `makeDocumentProjection` is called here so that every
        // later `getReactiveProjection` reuses this one Solid projection.
        createHandle: (initialDoc: Document) => {
            const automergeHandle = repo.create<ModelDocument>(initialDoc as ModelDocument);
            return { automergeHandle, projection: makeDocumentProjection(automergeHandle) };
        },

        // Reactive read view: the projection made when the handle was minted, so
        // notebook getters are tracked in Solid effects/JSX (see the render test
        // below) without rebuilding the projection on every read.
        getReactiveProjection: (handle) => handle.projection,

        changeDocument: (handle, fn) => handle.automergeHandle.change(fn),

        // Remote changes flow through the Automerge change event, so a notebook
        // built on this store reacts to collaborators editing the shared doc.
        subscribe: (handle, callback) => {
            const onChange = () => callback();
            handle.automergeHandle.on("change", onChange);
            return () => handle.automergeHandle.off("change", onChange);
        },

        // Detach Solid/Automerge proxies before the caller clones a subtree:
        // resolve the value's object id inside the current document and ask the
        // Automerge backend to materialize a plain-JS copy of that subtree.
        copyValue: (handle, value) => {
            const doc = handle.automergeHandle.doc();
            const objId = getObjectId(value as object);
            return getBackend(doc).materialize(objId!) as typeof value;
        },

        // The backend analog of `Api.makeUnversionedRef`: a handle we have
        // registered has a stable, versionless reference on this server.
        // Unregistered handles return `undefined`, per the interface — a
        // document the user just made is not yet referenceable.
        linkForHandle: (handle) => {
            const refId = refByDocId.get(handle.automergeHandle.documentId);
            if (!refId) {
                return undefined;
            }
            return { _id: refId, _version: null, _server: backend.serverHost };
        },

        // The backend analog of `Api.getDocHandle`: call `get_doc` over RPC,
        // unwrap the `RpcResult`, then turn the `RefDoc` into a document id and
        // `repo.find` it. Async, as backend access and `repo.find` are. Handles
        // are cached so a resolved ref stays a single handle/projection.
        getHandle: async (refId: string) => {
            const cached = handleByRefId.get(refId);
            if (cached) {
                return cached;
            }

            const result = await backend.get_doc(refId);
            if (result.tag !== "Ok") {
                return undefined;
            }

            const refDoc = result.content;
            // `Live` documents live in the shared repo (find by id); `Readonly`
            // documents arrive as bytes and are imported into a local repo.
            // This fake only serves `Live`, but the store handles both, exactly
            // as `Api.fetchDocCacheEntry` does.
            let automergeHandle: DocHandle<ModelDocument>;
            if (refDoc.tag === "Live") {
                automergeHandle = await repo.find<ModelDocument>(refDoc.docId as DocumentId);
            } else {
                const binaryString = atob(refDoc.binaryData);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                automergeHandle = repo.import<ModelDocument>(bytes);
            }

            const handle = { automergeHandle, projection: makeDocumentProjection(automergeHandle) };
            handleByRefId.set(refId, handle);
            refByDocId.set(automergeHandle.documentId, refId);
            return handle;
        },

        // Push a locally created handle to the backend, minting and caching its
        // ref id. The notebook binder creates handles with `createHandle` before
        // they are on the server, so a store integration exposes some flavour of
        // this to publish them (analog of `Api.createDoc`; see `publish` above
        // for why the shared-repo case only needs the `docId`).
        register: async (handle) => {
            const docId = handle.automergeHandle.documentId;
            const existing = refByDocId.get(docId);
            if (existing) {
                return existing;
            }
            const result = await backend.publish(docId);
            if (result.tag !== "Ok") {
                throw new Error(result.message);
            }
            const refId = result.content;
            refByDocId.set(docId, refId);
            handleByRefId.set(refId, {
                automergeHandle: handle.automergeHandle,
                projection: makeDocumentProjection(handle.automergeHandle),
            });
            return refId;
        },
    };

    return store;
}

describe("backend-backed Solid + Automerge DocumentStore", () => {
    test("reactive rendering: notebook getters track Automerge changes via Solid", () => {
        const backend = new FakeBackend();
        const store = createBackendStore(backend);
        const backendBinder = createBinder(store);

        const notebook = backendBinder.createNotebook(SimpleOlog, { name: "An Olog" });

        function Title(props: { title: string }) {
            return <h1>{props.title}</h1>;
        }

        function Types(props: {
            notebook: Notebook<
                typeof SimpleOlog,
                { automergeHandle: DocHandle<ModelDocument>; projection: ModelDocument }
            >;
        }) {
            return (
                <ul>
                    <For each={props.notebook.cellsOf(Type)}>{(cell) => <li>{cell.name}</li>}</For>
                </ul>
            );
        }

        const container = document.createElement("div");
        document.body.appendChild(container);

        const dispose = render(
            () => (
                <section>
                    <Title title={notebook.name} />
                    <Types notebook={notebook} />
                </section>
            ),
            container,
        );

        expect(container.querySelector("h1")?.textContent).toBe("An Olog");

        // A local mutation through the store re-renders reactively.
        notebook.update({ name: "A renamed Olog" });
        expect(container.querySelector("h1")?.textContent).toBe("A renamed Olog");

        // Adding a cell (an Automerge `change`) flows to the reactive list.
        notebook.add(Type, { name: "Thing" });
        expect([...container.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
            "Thing",
        ]);

        dispose();
        container.remove();
    });

    test("linkForHandle mints a backend ref only after registration", async () => {
        const backend = new FakeBackend();
        const store = createBackendStore(backend);
        const backendBinder = createBinder(store);

        const notebook = backendBinder.createNotebook(SimpleOlog, { name: "Local" });

        // Not yet on the backend: no stable reference.
        expect(store.linkForHandle(notebook.handle)).toBeUndefined();

        // Push to the backend, then a reference is available on this server.
        const refId = await store.register(notebook.handle);
        expect(store.linkForHandle(notebook.handle)).toEqual({
            _id: refId,
            _version: null,
            _server: backend.serverHost,
        });
    });

    test("getHandle resolves a backend ref to the same document (inverse of linkForHandle)", async () => {
        const backend = new FakeBackend();
        const store = createBackendStore(backend);
        const backendBinder = createBinder(store);

        const notebook = backendBinder.createNotebook(SimpleOlog, { name: "Shared" });
        notebook.add(Type, { name: "Thing" });
        const refId = await store.register(notebook.handle);

        // A fresh store over the same backend (e.g. a different browser tab)
        // resolves the ref by fetching it, and sees the same document.
        const otherStore = createBackendStore(backend);
        const resolved = await otherStore.getHandle(refId);

        expect(resolved).toBeDefined();
        const doc = otherStore.getReactiveProjection(resolved!);
        expect(doc.name).toBe("Shared");

        // The ref round-trips back to the same id.
        expect(otherStore.linkForHandle(resolved!)?._id).toBe(refId);
    });

    test("a notebook instantiating a backend document validates via getHandle resolution", async () => {
        const backend = new FakeBackend();
        const store = createBackendStore(backend);
        const backendBinder = createBinder(store);

        // The imported model lives on the backend.
        const imported = backendBinder.createNotebook(SimpleOlog, { name: "Imported" });
        imported.add(Type, { name: "Thing" });
        await store.register(imported.handle);

        // The main notebook instantiates it. `Instantiation` mints a link via
        // `store.linkForHandle(imported.handle)`, and `validate` resolves it
        // back through `store.getHandle` — the backend round-trip under test.
        // The main notebook must itself be on the backend, because `validate`
        // resolves the notebook's *own* model by minting a link to its handle
        // (see `resolveSelf`), which requires a stable ref.
        const notebook = backendBinder.createNotebook(SimpleOlog, { name: "Main" });
        notebook.add(Type, { name: "A" });
        notebook.add(Instantiation, { name: "ImportedOlog", model: imported });
        await store.register(notebook.handle);

        const result = await notebook.validate();
        expect(result.issues).toBeUndefined();
        expect(result.issues === undefined && result.value).toBeInstanceOf(DblModel);
    });
});

// Keep `createRoot` imported and exercised so the reactive-primitives path is
// covered even outside `render` (e.g. a headless consumer of `getReactiveProjection`).
describe("headless reactive read", () => {
    test("getReactiveProjection is reactive under createRoot", () => {
        const backend = new FakeBackend();
        const store = createBackendStore(backend);
        const backendBinder = createBinder(store);
        const notebook = backendBinder.createNotebook(SimpleOlog, { name: "Headless" });

        createRoot((dispose) => {
            expect(notebook.name).toBe("Headless");
            notebook.update({ name: "Renamed" });
            expect(notebook.name).toBe("Renamed");
            dispose();
        });
    });
});
