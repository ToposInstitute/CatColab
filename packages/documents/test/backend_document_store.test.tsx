// A full, production-shaped `DocumentStore` for the current frontend: Solid +
// Automerge for reactivity and local state, and a real backend client for
// creation, linking, and resolution. This mirrors what the frontend's `Api`
// class (packages/frontend/src/api/types.ts) does today — create a document
// through `rpc.new_ref`, resolve a ref id to an Automerge `DocumentId` over
// `rpc.get_doc`, then `repo.find` it — but expressed as the
// `DocumentStore<Handle>` abstraction from `catcolab-documents`.
//
// The store's `Handle` wraps an Automerge `DocHandle<Document>` together
// with the Solid projection built from it once, at handle creation; `getDocumentView`
// just returns that stable projection, exactly as
// `notebook_with_automerge_solid_component.lts.md` sketches. What this example
// adds over that sketch is the backend wiring:
//
//   * `createHandle` registers the new document with the backend as it is made
//     (the analog of `Api.createDoc` -> `rpc.new_ref.mutate`), so every
//     notebook created through this store is immediately backend-backed. This
//     is why `createHandle` is asynchronous.
//   * `getDocumentRef` mints a stable `{ id, version, server }` `DocumentRef`
//     for a registered handle (the analog of `Api.makeUnversionedRef`).
//   * `getHandle` walks a reference back to a handle by hitting the backend
//     (the analog of `Api.getDocHandle` -> `rpc.get_doc.query` -> `repo.find`),
//     so a notebook that instantiates another *backend* document can validate.
//
// Read `createBackendStore` top to bottom as the literal checklist of what
// someone integrating a real backend must supply for each `DocumentStore`
// method.
/* oxlint-disable unicorn/consistent-function-scoping */
import { getBackend, getObjectId, type Heads } from "@automerge/automerge";
import { type DocHandle, type DocumentId, Repo } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createRoot, For, getOwner, runWithOwner, type Owner } from "solid-js";
import { render } from "solid-js/web";
import { v7 } from "uuid";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
import { createBinder, type DocumentStore, Instantiation, type Notebook } from "catcolab-documents";
import { DblModel } from "catlog-wasm";
import {
    commitDraftDocHandle,
    createDraftDocHandle,
    undoDocHandleCommit,
} from "./automerge_transactions";

// ---------------------------------------------------------------------------
// A stand-in for the CatColab backend, modelled on its real RPC surface.
//
// The production backend is reached through a Qubit RPC client (see
// packages/frontend/src/api/rpc.ts and the generated `QubitServer` type in
// packages/backend/pkg/src/index.ts). Every method returns an `RpcResult<T>`,
// a tagged `Ok`/`Err` union, and document reads come back as a `RefDoc`, a
// tagged `Live`/`Readonly` union. We reproduce those shapes here so the store
// below has to unwrap them exactly like `Api.createDoc`/`Api.fetchDocCacheEntry`
// do.
//
// The two methods the store uses:
//
//   * `new_ref(content)`: create a document from `content` under a fresh ref id,
//     returning the ref id (the `_id` of a `StableRef`). Analog of
//     `rpc.new_ref.mutate`, called by `Api.createDoc`.
//   * `get_doc(refId)`: resolve a ref id to the Automerge document behind it.
//     Analog of `rpc.get_doc.query`, whose `docId` the frontend then `find`s.
//
// The backend holds its own networked `Repo` in production; here the store and
// backend share one in-memory `Repo`, and every document is served as `Live`
// (the store `find`s it by `docId`). The `Readonly` arm — where the backend
// ships document bytes to be imported into a local repo — is modelled too, so
// the store's unwrapping logic is complete, even though this fake only ever
// returns `Live`.
// ---------------------------------------------------------------------------
type RpcResult<T> = { tag: "Ok"; content: T } | { tag: "Err"; code: number; message: string };

type RefDoc = { tag: "Live"; docId: string; isDeleted: boolean };

class FakeBackend {
    readonly serverHost = "test.catcolab.org";

    /** The Automerge repo the backend serves documents out of. */
    readonly repo = new Repo();

    /** ref id -> Automerge document id, the mapping `get_doc` serves. */
    private readonly refs = new Map<string, DocumentId>();

    /**
     * Analog of `rpc.new_ref.mutate`: take document *content*, create the repo
     * document backend-side, and return a fresh ref id. This is what
     * `Api.createDoc` calls, and what the store's `createHandle` calls below.
     */
    async new_ref(content: Document): Promise<RpcResult<string>> {
        const handle = this.repo.create<Document>(content as Document);
        const refId = v7();
        this.refs.set(refId, handle.documentId);
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
// `DocumentStore<Handle>` where `Handle` wraps an Automerge `DocHandle` together
// with the Solid projection built from it once, at handle creation; `getDocumentView`
// returns that stable projection. The store keeps a bidirectional cache between
// a handle's Automerge `DocumentId` and the backend ref id it was registered
// under, so `getDocumentRef` can answer synchronously and `getHandle` can skip a
// round-trip for handles already resolved.
//
// There is no separate "register" step: `createHandle` registers the document
// with the backend as it creates it, so a notebook is referenceable the moment
// it exists — matching `Api.createDoc`, which is how the frontend makes a new
// document today.
// ---------------------------------------------------------------------------
// The store's handle wraps the Automerge `DocHandle` (local/remote state)
// together with the Solid projection built from it once. Declaring the handle
// shape is the one unavoidable step of any `DocumentStore` integration — every
// store method takes or returns it.
type StoreHandle = {
    docHandle: DocHandle<Document>;
    docView: Document;
};

function createBackendStore(backend: FakeBackend, owner?: Owner) {
    const repo = backend.repo;
    const handleByDocument = new WeakMap<object, StoreHandle>();

    // Build a handle from a `DocHandle`, projecting it once. The projection is
    // owned by `owner` (if given) so it stays reactive outside `render`.
    const makeHandle = (docHandle: DocHandle<Document>): StoreHandle => {
        const handle = {
            docHandle,
            docView: owner
                ? runWithOwner(owner, () => makeDocumentProjection(docHandle))!
                : makeDocumentProjection(docHandle),
        };
        handleByDocument.set(handle.docView, handle);
        return handle;
    };

    // handle document id <-> backend ref id, and ref id -> minted handle so a
    // ref resolves to one stable handle (and one projection) per store.
    const refByDocId = new Map<DocumentId, string>();
    const handleByRefId = new Map<string, StoreHandle>();

    // Annotated as `DocumentStore<StoreHandle, Heads>` so all methods share the
    // one handle type and the store is checked against the interface as it is
    // written. `Heads` is the store's commit `Version`: a transaction commit is
    // the span of Automerge heads from just before to just after the merge.
    const store: DocumentStore<StoreHandle, Heads> = {
        // Creation is a backend round-trip: `new_ref` creates the document from
        // its content and returns a ref id (analog of `Api.createDoc`), then
        // `get_doc` + `repo.find` load the `DocHandle` for it (analog of
        // `Api.getDocHandle`). The handle projects the `DocHandle` once, and both
        // caches are primed so `getDocumentRef` answers immediately afterwards.
        // Because this is asynchronous, `Binder.createNotebook` is asynchronous too.
        createHandle: async (initialDoc: Document) => {
            const created = await backend.new_ref(initialDoc);
            if (created.tag !== "Ok") {
                throw new Error(created.message);
            }
            const refId = created.content;

            const fetched = await backend.get_doc(refId);
            if (fetched.tag !== "Ok") {
                throw new Error(fetched.message);
            }
            const docHandle = await repo.find<Document>(fetched.content.docId as DocumentId);
            const handle = makeHandle(docHandle);

            refByDocId.set(docHandle.documentId, refId);
            handleByRefId.set(refId, handle);
            return handle;
        },

        // Reactive read view: return the projection built once at handle
        // creation, so notebook getters are tracked in Solid effects/JSX (see
        // the render test below) without rebuilding it per read.
        getDocumentView: (handle) => handle.docView,

        changeDocument: (handle, fn) => handle.docHandle.change(fn),

        // The three optional draft methods make `Notebook.beginTransaction` work
        // over this store: a draft is a private clone of the document's
        // history (with its own Solid projection, so a notebook attached over
        // it is reactive like the original), a commit is the span of heads
        // across the merge back, and undo applies the commit's inverse diff.
        // See `automerge_transactions.ts` for the `DocHandle`-level mechanics.
        createDraft: (handle) => makeHandle(createDraftDocHandle(handle.docHandle)),
        commitDraft: (handle, draft) => commitDraftDocHandle(handle.docHandle, draft.docHandle),
        revertCommit: (handle, commit) => undoDocHandleCommit(handle.docHandle, commit),

        // Remote changes flow through the Automerge change event, so a notebook
        // built on this store reacts to collaborators editing the shared doc.
        subscribe: (handle, callback) => {
            handle.docHandle.on("change", callback);
            return () => handle.docHandle.off("change", callback);
        },

        // Detach Solid/Automerge proxies before the caller clones a subtree:
        // resolve the value's object id inside the current document and ask the
        // Automerge backend to materialize a plain-JS copy of that subtree.
        copyValue: (handle, value) => {
            const doc = handle.docHandle.doc();
            const objId = getObjectId(value as object);
            return getBackend(doc).materialize(objId!) as typeof value;
        },

        // The backend analog of `Api.makeUnversionedRef`: a handle the store
        // created (and so registered) has a stable, versionless reference on
        // this server. Every handle this store hands out is registered, so a
        // reference is always available; a handle unknown to this store (e.g.
        // one minted by a different store instance) is a programming error.
        getDocumentRef: (handle) => {
            const refId = refByDocId.get(handle.docHandle.documentId);
            if (!refId) {
                throw new Error("handle is not registered with this store");
            }
            return { id: refId, version: null, server: backend.serverHost };
        },

        // The backend analog of `Api.getDocHandle`: call `get_doc` over RPC,
        // unwrap the `RpcResult`, then turn the `RefDoc` into a handle and cache
        // it so a resolved ref stays a single handle/projection.
        getHandle: async (ref) => {
            const refId = ref.id;
            const cached = handleByRefId.get(refId);
            if (cached) {
                return { tag: "Ok", content: cached };
            }

            const result = await backend.get_doc(refId);
            if (result.tag !== "Ok") {
                return {
                    tag: "Err",
                    content: [{ message: `Cannot resolve reference "${refId}".`, path: ["id"] }],
                };
            }

            const docHandle = await repo.find<Document>(result.content.docId as DocumentId);
            const handle = makeHandle(docHandle);
            handleByRefId.set(refId, handle);
            refByDocId.set(docHandle.documentId, refId);
            return { tag: "Ok", content: handle };
        },
    };

    return Object.assign(store, {
        getHandleForDocument: (document: object) => handleByDocument.get(document),
    });
}

describe("backend-backed Solid + Automerge DocumentStore", () => {
    test("reactive rendering: notebook getters track Automerge changes via Solid", async () => {
        await createRoot(async (rootDispose) => {
            const backend = new FakeBackend();
            const store = createBackendStore(backend, getOwner()!);
            const backendBinder = createBinder(store);
            const notebook = await backendBinder.createNotebook(SimpleOlog, { title: "An Olog" });

            function Title(props: { title: string }) {
                return <h1>{props.title}</h1>;
            }

            function Types(props: { notebook: Notebook<typeof SimpleOlog, StoreHandle> }) {
                return (
                    <ul>
                        <For each={props.notebook.cellsOf(Type)}>
                            {(cell) => <li>{cell.label}</li>}
                        </For>
                    </ul>
                );
            }

            const container = document.createElement("div");
            document.body.appendChild(container);

            const dispose = render(
                () => (
                    <section>
                        <Title title={notebook.title} />
                        <Types notebook={notebook} />
                    </section>
                ),
                container,
            );

            expect(container.querySelector("h1")?.textContent).toBe("An Olog");

            // A local mutation through the store re-renders reactively.
            notebook.update({ title: "A renamed Olog" });
            expect(container.querySelector("h1")?.textContent).toBe("A renamed Olog");

            // Adding a cell (an Automerge `change`) flows to the reactive list.
            notebook.add(Type, { label: "Thing" });
            expect([...container.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
                "Thing",
            ]);

            dispose();
            container.remove();
            rootDispose();
        });
    });

    test("createNotebook registers with the backend, so getDocumentRef mints a ref", async () => {
        await createRoot(async (dispose) => {
            const backend = new FakeBackend();
            const store = createBackendStore(backend, getOwner()!);
            const backendBinder = createBinder(store);
            // `createNotebook` registers through `new_ref` as it creates the
            // document, so the handle has a stable reference right away.
            const notebook = await backendBinder.createNotebook(SimpleOlog, { title: "Local" });

            const ref = store.getDocumentRef(notebook.handle);
            expect(ref).toEqual({
                id: expect.any(String),
                version: null,
                server: backend.serverHost,
            });
            dispose();
        });
    });

    test("getHandle resolves a backend ref to the same document (inverse of getDocumentRef)", async () => {
        await createRoot(async (dispose) => {
            const backend = new FakeBackend();
            const owner = getOwner()!;
            const store = createBackendStore(backend, owner);
            const backendBinder = createBinder(store);
            const notebook = await backendBinder.createNotebook(SimpleOlog, { title: "Shared" });
            notebook.add(Type, { label: "Thing" });
            const ref = store.getDocumentRef(notebook.handle);
            const refId = ref.id;

            // A fresh store over the same backend (e.g. a different browser tab)
            // resolves the ref by fetching it, and sees the same document.
            const otherStore = createBackendStore(backend, owner);
            const resolved = await otherStore.getHandle(ref);

            expect(resolved.tag).toBe("Ok");
            if (resolved.tag !== "Ok") {
                throw new Error("expected Ok");
            }
            const handle = resolved.content;
            const doc = otherStore.getDocumentView(handle);
            expect(doc.name).toBe("Shared");

            // The ref round-trips back to the same id.
            expect(otherStore.getDocumentRef(handle).id).toBe(refId);
            dispose();
        });
    });

    test("loadNotebookFromRef resolves a backend ref to a notebook (via getHandle)", async () => {
        await createRoot(async (dispose) => {
            const backend = new FakeBackend();
            const owner = getOwner()!;
            const store = createBackendStore(backend, owner);
            const backendBinder = createBinder(store);

            // Create a document and mint its stable reference — the analog of
            // another tab (or a deep-link) landing on a document by its
            // `{ id, server }` ref, the way the frontend opens a document through
            // `Api.getDocHandle`.
            const original = await backendBinder.createNotebook(SimpleOlog, {
                title: "Discovered",
            });
            original.add(Type, { label: "Thing" });
            const ref = store.getDocumentRef(original.handle);

            // A fresh store over the same backend represents that other consumer.
            // `loadNotebookFromRef` resolves the reference through the store's
            // `getHandle` (the `get_doc` + `repo.find` round-trip) and wraps the
            // resulting handle as a notebook.
            const otherStore = createBackendStore(backend, owner);
            const otherBinder = createBinder(otherStore);
            const loaded = await otherBinder.loadNotebookFromRef(SimpleOlog, ref);

            expect(loaded.tag).toBe("Ok");
            if (loaded.tag !== "Ok") {
                throw new Error("expected Ok");
            }
            const notebook = loaded.content;
            // The loaded notebook views the same live document: it reads the
            // existing name and cell, and edits propagate back to the original
            // through the shared Automerge document.
            expect(notebook.title).toBe("Discovered");
            expect(notebook.cellsOf(Type).map((cell) => cell.label)).toEqual(["Thing"]);

            notebook.update({ title: "Renamed via ref" });
            expect(store.getDocumentView(original.handle).name).toBe("Renamed via ref");

            dispose();
        });
    });

    test("loadNotebookFromRef returns Err for a ref the store cannot resolve", async () => {
        await createRoot(async (dispose) => {
            const backend = new FakeBackend();
            const store = createBackendStore(backend, getOwner()!);
            const backendBinder = createBinder(store);

            // No document was ever registered under this id, so `getHandle`
            // returns `undefined` and the load reports an `Err`.
            const loaded = await backendBinder.loadNotebookFromRef(SimpleOlog, {
                id: v7(),
                version: null,
                server: backend.serverHost,
            });
            expect(loaded.tag).toBe("Err");
            dispose();
        });
    });

    test("loadNotebookFromRef rejects a ref whose document theory does not match the shape", async () => {
        await createRoot(async (dispose) => {
            const backend = new FakeBackend();
            const store = createBackendStore(backend, getOwner()!);
            const backendBinder = createBinder(store);

            // A diagram document (created by an instance) is not a `model`
            // document, so loading it with the model shape `SimpleOlog` fails.
            const schema = await backendBinder.createNotebook(SimpleOlog, { title: "Schema" });
            const instance = await backendBinder.createInstance(schema, { title: "Instance" });
            const ref = store.getDocumentRef(instance.handle);

            const loaded = await backendBinder.loadNotebookFromRef(SimpleOlog, ref);
            expect(loaded.tag).toBe("Err");
            dispose();
        });
    });

    test("loadInstanceFromRef attaches to the existing backend instance", async () => {
        await createRoot(async (dispose) => {
            const backend = new FakeBackend();
            const owner = getOwner()!;
            const store = createBackendStore(backend, owner);
            const binder = createBinder(store);
            const schema = await binder.createNotebook(SimpleOlog, { title: "Schema" });
            schema.add(Type, { label: "Person" });
            const instance = await binder.createInstance(schema, { title: "Data" });
            const validated = await instance.validate();
            if (!validated.content.instance) {
                throw new Error("expected instance schema to resolve");
            }

            const otherStore = createBackendStore(backend, owner);
            const otherBinder = createBinder(otherStore);
            const loadedSchema = await otherBinder.loadNotebookFromRef(
                SimpleOlog,
                store.getDocumentRef(schema.handle),
            );
            expect(loadedSchema.tag).toBe("Ok");
            if (loadedSchema.tag !== "Ok") {
                throw new Error("expected schema to load");
            }

            const loadedInstance = await otherBinder.loadInstanceFromRef(
                loadedSchema.content,
                store.getDocumentRef(instance.handle),
            );
            expect(loadedInstance.tag).toBe("Ok");
            if (loadedInstance.tag !== "Ok") {
                throw new Error("expected instance to load");
            }

            const loadedValidation = await loadedInstance.content.validate();
            if (!loadedValidation.content.instance) {
                throw new Error("expected loaded instance schema to resolve");
            }
            loadedValidation.content.instance.tables[0]?.addRow();
            expect(validated.content.instance.tables[0]?.rows).toHaveLength(1);
            expect(otherStore.getDocumentRef(loadedInstance.content.handle)).toEqual(
                store.getDocumentRef(instance.handle),
            );
            dispose();
        });
    });

    test("loadInstanceFromRef rejects non-instance and mismatched-schema refs", async () => {
        await createRoot(async (dispose) => {
            const backend = new FakeBackend();
            const store = createBackendStore(backend, getOwner()!);
            const binder = createBinder(store);
            const schema = await binder.createNotebook(SimpleOlog, { title: "Schema" });
            const otherSchema = await binder.createNotebook(SimpleOlog, { title: "Other schema" });
            const instance = await binder.createInstance(schema, { title: "Data" });

            const wrongType = await binder.loadInstanceFromRef(
                schema,
                store.getDocumentRef(schema.handle),
            );
            expect(wrongType.tag).toBe("Err");

            const wrongSchema = await binder.loadInstanceFromRef(
                otherSchema,
                store.getDocumentRef(instance.handle),
            );
            expect(wrongSchema.tag).toBe("Err");

            store.changeDocument(instance.handle, (document) => {
                if (document.type === "instance") {
                    document.instanceOf._server = "other.catcolab.org";
                }
            });
            const wrongServer = await binder.loadInstanceFromRef(
                schema,
                store.getDocumentRef(instance.handle),
            );
            expect(wrongServer.tag).toBe("Err");
            dispose();
        });
    });

    test("a notebook instantiating a backend document validates via getHandle resolution", async () => {
        await createRoot(async (dispose) => {
            const backend = new FakeBackend();
            const store = createBackendStore(backend, getOwner()!);
            const backendBinder = createBinder(store);
            // The imported model lives on the backend the moment it is created.
            const imported = await backendBinder.createNotebook(SimpleOlog, { title: "Imported" });
            imported.add(Type, { label: "Thing" });

            // The main notebook instantiates it. `Instantiation` mints a link via
            // `store.getDocumentRef(imported.handle)`, and `validate` resolves it
            // back through `store.getHandle` — the backend round-trip under test.
            // `validate` also resolves the notebook's *own* model by minting a link
            // to its handle (see `resolveSelf`), which requires a stable ref; since
            // `createNotebook` registered it, that link is available too.
            const notebook = await backendBinder.createNotebook(SimpleOlog, { title: "Main" });
            notebook.add(Type, { label: "A" });
            notebook.add(Instantiation, { label: "ImportedOlog", model: imported });

            const result = await notebook.validate();
            expect(result.tag).toBe("Ok");
            expect(result.tag === "Ok" && result.content).toBeInstanceOf(DblModel);
            dispose();
        });
    });
});

// Keep `createRoot` imported and exercised so the reactive-primitives path is
// covered even outside `render` (e.g. a headless consumer of `getDocumentView`).
describe("headless reactive read", () => {
    test("getDocumentView is reactive under createRoot", async () => {
        await createRoot(async (dispose) => {
            const backend = new FakeBackend();
            const store = createBackendStore(backend, getOwner()!);
            const backendBinder = createBinder(store);
            const notebook = await backendBinder.createNotebook(SimpleOlog, { title: "Headless" });

            expect(notebook.title).toBe("Headless");
            notebook.update({ title: "Renamed" });
            expect(notebook.title).toBe("Renamed");
            dispose();
        });
    });
});
