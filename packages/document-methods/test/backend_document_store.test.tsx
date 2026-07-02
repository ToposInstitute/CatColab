// A full, production-shaped `DocumentStore` for the current frontend: Solid +
// Automerge for reactivity and local state, and a real backend client for
// `linkForHandle`/`getHandle`. This mirrors what the frontend's `Api` class
// (packages/frontend/src/api/types.ts) does today — resolve a document ref id
// to an Automerge `DocumentId` over RPC, then `repo.find` it — but expressed as
// the `DocumentStore<Handle>` abstraction from `catcolab-documents`.
//
// The store's `Handle` is an Automerge `DocHandle<ModelDocument>`, exactly as
// `notebook_with_automerge_solid_component.lts.md` sketches. What this example
// adds over that sketch is the backend wiring: `linkForHandle` mints a stable
// `{ _id, _version, _server }` reference (the analog of `Api.makeUnversionedRef`)
// and `getHandle` walks a reference back to a handle by hitting the backend
// (the analog of `Api.getDocHandle` -> `rpc.get_doc.query` -> `repo.find`), so a
// notebook that instantiates another *backend* document can be validated.
//
// This test is expected to FAIL for now: the interface's `getHandle` is
// synchronous, but real backend access (and `repo.find`) is asynchronous. The
// example is written against an async `getHandle` to make that mismatch
// concrete; see the note above `getHandle` below and the `@ts-expect-error`ed
// assignment to the current interface. Once `DocumentStore.getHandle` (and the
// `resolveModelInStore` caller in src/future/store.ts) are made async, the
// `@ts-expect-error` should be removed and the resolution test should pass.
/* oxlint-disable unicorn/consistent-function-scoping */
import { type Doc, getBackend, getObjectId } from "@automerge/automerge";
import {
    type DocHandle,
    type DocumentId,
    Repo,
} from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import { createRoot, For } from "solid-js";
import { render } from "solid-js/web";
import { v7 } from "uuid";
import { describe, expect, test } from "vitest";

import {
    createBinder,
    type DocumentStore,
    Instantiation,
    type Notebook,
} from "catcolab-documents";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import type { ModelDocument } from "catcolab-document-methods";
import type { Document, Link } from "catcolab-document-types";
import { DblModel } from "catlog-wasm";

// ---------------------------------------------------------------------------
// A stand-in for the CatColab backend.
//
// The real backend is reached through a Qubit RPC client (`rpc.get_doc.query`,
// `rpc.new_ref.mutate`; see packages/frontend/src/api/rpc.ts) plus a networked
// Automerge `Repo`. Here we model the two things the store actually needs:
//
//   * `new_ref`: register an Automerge document under a fresh ref id, returning
//     the ref id (the `_id` in a `StableRef`). Analog of `rpc.new_ref.mutate`.
//   * `get_doc`: resolve a ref id to the Automerge `DocumentId` it points at.
//     Analog of `rpc.get_doc.query`, whose `docId` the frontend then `find`s.
//
// The backend and the store share one in-memory `Repo` here; in production the
// store holds a networked repo and the backend a separate one, connected over a
// websocket. That difference does not change the store's shape.
// ---------------------------------------------------------------------------
class FakeBackend {
    readonly serverHost = "test.catcolab.org";

    /** ref id -> Automerge document id, the mapping `get_doc` serves. */
    private readonly refs = new Map<string, DocumentId>();

    constructor(readonly repo: Repo) {}

    /** Analog of `rpc.new_ref.mutate`: register a handle, return its ref id. */
    async newRef(docId: DocumentId): Promise<string> {
        const refId = v7();
        this.refs.set(refId, docId);
        return refId;
    }

    /** Analog of `rpc.get_doc.query`: ref id -> Automerge document id. */
    async getDoc(refId: string): Promise<DocumentId | undefined> {
        return this.refs.get(refId);
    }
}

// ---------------------------------------------------------------------------
// The store.
// ---------------------------------------------------------------------------
function materializeFromAutomerge<T>(doc: Doc<unknown>, subtree: T): T {
    const objId = getObjectId(subtree as object);
    return getBackend(doc).materialize(objId!) as T;
}

// The store augments the plain Solid+Automerge store with backend-backed
// linking. We keep a bidirectional cache between a handle's Automerge
// `DocumentId` and the backend ref id it was registered under, so that:
//
//   * `linkForHandle(handle)` returns the ref for a handle we have registered.
//     A handle that has never been pushed to the backend has no ref, so this
//     returns `undefined` — matching the interface contract.
//   * `getHandle(refId)` resolves a ref through the backend and loads the
//     Automerge document, caching the mapping for subsequent synchronous-ish
//     lookups. This is where real network access happens.
interface BackendDocumentStore extends DocumentStore<DocHandle<ModelDocument>> {
    /** Push a handle to the backend, minting and caching its ref id. */
    register(handle: DocHandle<ModelDocument>): Promise<string>;
}

function createBackendStore(backend: FakeBackend): BackendDocumentStore {
    const repo = backend.repo;

    // handle document id <-> backend ref id.
    const refByDocId = new Map<DocumentId, string>();
    const handleByRefId = new Map<string, DocHandle<ModelDocument>>();

    const register = async (handle: DocHandle<ModelDocument>): Promise<string> => {
        const existing = refByDocId.get(handle.documentId);
        if (existing) {
            return existing;
        }
        const refId = await backend.newRef(handle.documentId);
        refByDocId.set(handle.documentId, refId);
        handleByRefId.set(refId, handle);
        return refId;
    };

    const store: BackendDocumentStore = {
        // Local creation: a fresh Automerge document. It is not on the backend
        // until `register` (or a notebook's own linking flow) pushes it, so it
        // has no stable ref yet — exactly like a document the user just made.
        createHandle: (initialDoc: Document) => repo.create<ModelDocument>(initialDoc as ModelDocument),

        // Reactive read view via the Solid primitive, so notebook getters are
        // tracked in Solid effects/JSX (see the render test below).
        viewDocument: (handle) => makeDocumentProjection(handle),

        changeDocument: (handle, fn) => handle.change(fn),

        // Remote changes flow through the Automerge change event, so a notebook
        // built on this store reacts to collaborators editing the shared doc.
        subscribe: (handle, callback) => {
            const onChange = () => callback();
            handle.on("change", onChange);
            return () => handle.off("change", onChange);
        },

        // Detach Solid/Automerge proxies before the caller clones a subtree.
        copyValue: (handle, value) => materializeFromAutomerge(handle.doc(), value),

        // The backend analog of `Api.makeUnversionedRef`: a handle we have
        // registered has a stable, versionless reference on this server.
        // Unregistered handles return `undefined`, per the interface.
        linkForHandle: (handle): Omit<Link, "type"> | undefined => {
            const refId = refByDocId.get(handle.documentId);
            if (!refId) {
                return undefined;
            }
            return { _id: refId, _version: null, _server: backend.serverHost };
        },

        // The backend analog of `Api.getDocHandle`: resolve a ref id to an
        // Automerge document id over RPC, then `repo.find` it.
        //
        // NOTE: this is async because real backend + `repo.find` are async, but
        // the current `DocumentStore.getHandle` (and its `resolveModelInStore`
        // caller) are synchronous. Making them async is the change this example
        // is written to motivate; hence the `@ts-expect-error` on the interface
        // assignment below.
        getHandle: (async (refId: string): Promise<DocHandle<ModelDocument> | undefined> => {
            const cached = handleByRefId.get(refId);
            if (cached) {
                return cached;
            }
            const docId = await backend.getDoc(refId);
            if (!docId) {
                return undefined;
            }
            const handle = await repo.find<ModelDocument>(docId);
            handleByRefId.set(refId, handle);
            refByDocId.set(handle.documentId, refId);
            return handle;
        }) as unknown as DocumentStore<DocHandle<ModelDocument>>["getHandle"],

        register,
    };

    return store;
}

describe("backend-backed Solid + Automerge DocumentStore", () => {
    test("reactive rendering: notebook getters track Automerge changes via Solid", () => {
        const backend = new FakeBackend(new Repo());
        const store = createBackendStore(backend);
        const backendBinder = createBinder(store);

        const notebook = backendBinder.createNotebook(SimpleOlog, { name: "An Olog" });

        function Title(props: { title: string }) {
            return <h1>{props.title}</h1>;
        }

        function Types(props: { notebook: Notebook<typeof SimpleOlog, DocHandle<ModelDocument>> }) {
            return (
                <ul>
                    <For each={props.notebook.cellsOf(Type)}>
                        {(cell) => <li>{cell.name}</li>}
                    </For>
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
        const backend = new FakeBackend(new Repo());
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
        const backend = new FakeBackend(new Repo());
        const store = createBackendStore(backend);
        const backendBinder = createBinder(store);

        const notebook = backendBinder.createNotebook(SimpleOlog, { name: "Shared" });
        notebook.add(Type, { name: "Thing" });
        const refId = await store.register(notebook.handle);

        // A fresh store over the same backend (e.g. a different browser tab)
        // resolves the ref by fetching it, and sees the same document.
        const otherStore = createBackendStore(backend);
        const resolved = await (otherStore.getHandle as unknown as (
            id: string,
        ) => Promise<DocHandle<ModelDocument> | undefined>)(refId);

        expect(resolved).toBeDefined();
        const doc = otherStore.viewDocument(resolved!);
        expect(doc.name).toBe("Shared");

        // The ref round-trips back to the same id.
        expect(otherStore.linkForHandle(resolved!)?._id).toBe(refId);
    });

    test("a notebook instantiating a backend document validates via getHandle resolution", async () => {
        const backend = new FakeBackend(new Repo());
        const store = createBackendStore(backend);
        const backendBinder = createBinder(store);

        // The imported model lives on the backend.
        const imported = backendBinder.createNotebook(SimpleOlog, { name: "Imported" });
        imported.add(Type, { name: "Thing" });
        await store.register(imported.handle);

        // The main notebook instantiates it. `Instantiation` mints a link via
        // `store.linkForHandle(imported.handle)`, and `validate` resolves it
        // back through `store.getHandle` — the backend round-trip under test.
        const notebook = backendBinder.createNotebook(SimpleOlog, { name: "Main" });
        notebook.add(Type, { name: "A" });
        notebook.add(Instantiation, { name: "ImportedOlog", model: imported });

        const result = await notebook.validate();
        expect(result.issues).toBeUndefined();
        expect(result.issues === undefined && result.value).toBeInstanceOf(DblModel);
    });
});

// Keep `createRoot` imported and exercised so the reactive-primitives path is
// covered even outside `render` (e.g. a headless consumer of `viewDocument`).
describe("headless reactive read", () => {
    test("viewDocument is reactive under createRoot", () => {
        const backend = new FakeBackend(new Repo());
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
