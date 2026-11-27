// @vitest-environment happy-dom
// The happy-dom environment makes solid-js resolve to its reactive client
// build, which the reactive projection tests depend on.
import { ImmutableString, spans, splice, splitBlock } from "@automerge/automerge";
import { type DocHandle, Repo } from "@automerge/automerge-repo";
import type { UserState } from "catcolab-api/src/user_state";
import { createDocumentDataView, createInstanceValidationView } from "catcolab-documents-solid";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { type Auth, onAuthStateChanged } from "firebase/auth";
import { createComponent, createRenderEffect, createRoot } from "solid-js";
import { parse as uuidParse } from "uuid";
import { describe, expect, test, vi } from "vitest";

import {
    Instance as LegacyInstance,
    Model,
    type ModelDocument,
    Nb,
} from "catcolab-document-methods";
import { createBinder, defineShape, type InstanceDocument } from "catcolab-documents";
import { INITIAL_USER_STATE, useUserState } from "../user/user_state_context";
import { UserStateProvider } from "../user/user_state_provider";
import { BinderContext } from "./context";
import { makeLiveDoc } from "./document";
import { createApiBinder, createApiDocumentStore } from "./document_store";
import type { Api } from "./types";

vi.mock("firebase/auth", async (importOriginal) => ({
    ...(await importOriginal<typeof import("firebase/auth")>()),
    onAuthStateChanged: vi.fn<typeof onAuthStateChanged>(),
}));

function apiMetaFixture() {
    let notify!: () => Promise<void>;
    const stopAuth = vi.fn<() => void>();
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, next) => {
        if (typeof next !== "function") {
            throw new Error("Expected auth callback");
        }
        notify = () => Promise.resolve(next(null));
        return stopAuth;
    });
    const query = vi.fn<() => Promise<{ tag: "Ok"; content: string }>>();
    const find = vi.fn<(id: string) => Promise<DocHandle<UserState>>>();
    const api = {
        rpc: { get_user_state_doc_id: { query } },
        repo: { find },
    } as unknown as Api;
    const binder = createApiBinder(api, {} as Auth);
    return {
        binder,
        meta: { doc: binder.meta, dispose: binder.dispose },
        notify,
        query,
        find,
        stopAuth,
        async load(handle: DocHandle<UserState>) {
            query.mockResolvedValue({ tag: "Ok", content: handle.documentId });
            find.mockResolvedValue(handle);
            await notify();
        },
    };
}

function authBinderFixture() {
    const fixture = apiMetaFixture();
    const repo = new Repo();
    const handles = ["alice", "bob"].map((username) =>
        repo.create<UserState>({
            ...structuredClone(INITIAL_USER_STATE),
            profile: { username, displayName: null },
        }),
    );
    const [first, second] = handles as [DocHandle<UserState>, DocHandle<UserState>];
    fixture.query.mockResolvedValue({ tag: "Ok", content: first.documentId });
    fixture.find.mockImplementation(
        async (id) => handles.find((handle) => handle.documentId === id)!,
    );
    return { ...fixture, first, second };
}

describe("API binder meta lifecycle", () => {
    test("loads and rebinds meta on auth changes and cleans up on disposal", async () => {
        const { binder, notify, stopAuth, query, first, second } = authBinderFixture();
        const observed: Array<string | null> = [];
        binder.meta.onChange(() => observed.push(binder.meta.data().profile.username));
        expect(observed).toEqual([]);
        await notify();
        expect(observed).toEqual(["alice"]);
        query.mockResolvedValue({ tag: "Ok", content: second.documentId });
        const reloading = notify();
        expect(binder.meta.data()).toEqual(INITIAL_USER_STATE);
        await reloading;
        expect(observed).toEqual(["alice", null, "bob"]);
        first.change((doc) => {
            doc.profile.username = "ignored";
        });
        expect(binder.meta.data().profile.username).toBe("bob");
        binder.dispose();
        expect(stopAuth).toHaveBeenCalledOnce();
        second.change((doc) => {
            doc.profile.username = "after disposal";
        });
        await notify();
        expect(observed).toEqual(["alice", null, "bob"]);
        expect(query).toHaveBeenCalledTimes(2);
    });

    test("ignores stale handle loads after another auth change", async () => {
        const { binder, notify, query, find, first, second } = authBinderFixture();
        let finish!: (value: DocHandle<UserState>) => void;
        find.mockReturnValueOnce(
            new Promise<DocHandle<UserState>>((resolve) => {
                finish = resolve;
            }),
        );
        const loading = notify();
        await expect.poll(() => find.mock.calls.length).toBe(1);
        query.mockResolvedValue({ tag: "Ok", content: second.documentId });
        await notify();
        finish(first);
        await loading;
        expect(binder.meta.data().profile.username).toBe("bob");
        first.change((doc) => {
            doc.profile.username = "ignored";
        });
        expect(binder.meta.data().profile.username).toBe("bob");
        binder.dispose();
    });
});

describe("API store meta", () => {
    test("exposes binder meta through UserStateContext", async () => {
        const repo = new Repo();
        const { binder, load } = apiMetaFixture();
        let data!: UserState;
        const observed: Array<string | null> = [];
        const dispose = createRoot((dispose) => {
            createComponent(BinderContext.Provider, {
                value: binder,
                get children() {
                    return createComponent(UserStateProvider, {
                        get children() {
                            data = useUserState();
                            createRenderEffect(() => observed.push(data.profile.username));
                            return undefined;
                        },
                    });
                },
            });
            return dispose;
        });
        expect(data).toEqual(binder.meta.data());
        const handle = repo.create<UserState>({
            ...structuredClone(INITIAL_USER_STATE),
            profile: { username: "alice", displayName: null },
            documents: {
                example: {
                    name: "Example",
                    typeName: "model",
                    theory: "simple-olog",
                    permissions: [{ user: null, level: "Read" }],
                    createdAt: 0,
                    deletedAt: null,
                    currentSnapshotUpdatedAt: 1,
                    currentSnapshot: 1,
                    snapshots: { "1": { parent: null, createdAt: 1, heads: [] } },
                    dependsOn: [],
                    usedBy: [],
                },
            },
        });
        await load(handle);
        expect(observed).toEqual([null, "alice"]);
        expect(data.documents.example).toEqual(handle.doc().documents.example);
        const before = binder.meta.data();
        handle.change((doc) => {
            doc.knownUsers.bob = { username: "bob", displayName: null };
        });
        expect(data.knownUsers.bob?.username).toBe("bob");
        expect(observed).toEqual([null, "alice"]);
        expect(before.knownUsers.bob).toBeUndefined();
        dispose();
        await load(handle);
        expect(observed).toEqual([null, "alice"]);
        binder.dispose();
    });

    test("reads current Automerge snapshots without subscribers and retains the last on disposal", async () => {
        const { binder, notify, first } = authBinderFixture();
        await notify();
        const loaded = binder.meta.data();
        first.change((doc) => {
            doc.profile.username = "updated";
        });
        const updated = binder.meta.data();
        expect(updated.profile.username).toBe("updated");
        expect(loaded.profile.username).toBe("alice");
        binder.dispose();
        first.change((doc) => {
            doc.profile.username = "after disposal";
        });
        expect(binder.meta.data()).toBe(updated);
    });

    test("normalizes immutable strings and preserves relation UUID bytes", async () => {
        const repo = new Repo();
        const refId = uuidParse(crypto.randomUUID());
        const handle = repo.create<UserState>({
            ...structuredClone(INITIAL_USER_STATE),
            profile: {
                username: new ImmutableString("alice") as unknown as string,
                displayName: null,
            },
            documents: {
                example: {
                    usedBy: [{ refId, relationType: "instance-of" }],
                } as UserState["documents"][string],
            },
        });
        const { meta, load } = apiMetaFixture();
        await load(handle);
        expect(meta.doc.data().profile.username).toBe("alice");
        const bytes = meta.doc.data().documents.example?.usedBy[0]?.refId;
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(bytes).toEqual(refId);
        expect(bytes).not.toBe(refId);
        meta.dispose();
    });
});

const schemaRef = crypto.randomUUID();
const instanceRef = crypto.randomUUID();
const server = "test.catcolab.org";

async function createFixture() {
    const repo = new Repo();
    const schemaAutomergeHandle = repo.create(Model.newModelDocument({ theory: "simple-olog" }));
    const instanceAutomergeHandle = repo.create(
        LegacyInstance.newInstanceDocument({
            _id: schemaRef,
            _version: null,
            _server: server,
        }),
    );
    const instanceLiveDoc = makeLiveDoc<InstanceDocument>(instanceAutomergeHandle);

    // A user state whose relations record the instance and the schema as
    // depending on each other, the way the backend computes relations.
    // The unknown relation type is not a link type: it must be dropped.
    const userState = {
        documents: {
            [schemaRef]: {
                name: "Schema",
                typeName: "model",
                createdAt: 0,
                dependsOn: [],
                usedBy: [
                    { refId: uuidParse(instanceRef), relationType: "instance-of" },
                    { refId: uuidParse(instanceRef), relationType: "not-a-link" },
                ],
                deletedAt: null,
            },
            [instanceRef]: {
                name: "Instance",
                typeName: "instance",
                createdAt: 0,
                usedBy: [],
                dependsOn: [{ refId: uuidParse(schemaRef), relationType: "instance-of" }],
                deletedAt: null,
            },
        },
    } as unknown as UserState;

    const api = {
        serverHost: server,
        async getDocHandle(refId: string) {
            if (refId === schemaRef) {
                return schemaAutomergeHandle;
            }
            if (refId === instanceRef) {
                return instanceAutomergeHandle;
            }
            throw new Error(`Unknown document ref: ${refId}`);
        },
    } as unknown as Api;
    const userStateHandle = repo.create<UserState>(userState);
    const { meta, load } = apiMetaFixture();
    await load(userStateHandle);
    const store = createApiDocumentStore(api, meta.doc);

    return {
        repo,
        binder: createBinder(store),
        instanceAutomergeHandle,
        instanceLiveDoc,
        schemaAutomergeHandle,
        userStateHandle,
        store,
    };
}

async function createFixtureWithSchema() {
    const fixture = await createFixture();
    const schema = await fixture.binder.loadNotebookFromRef(SimpleOlog, {
        id: schemaRef,
        version: null,
        server,
    });
    expect(schema.tag).toBe("Ok");
    if (schema.tag !== "Ok") {
        throw new Error("expected schema to load");
    }

    const schemaHandle = await fixture.store.getHandle(schema.content.ref);
    const instanceHandle = await fixture.store.getHandle({
        id: instanceRef,
        version: null,
        server,
    });
    if (schemaHandle.tag === "Err" || instanceHandle.tag === "Err") {
        throw new Error("expected store handles");
    }
    return {
        ...fixture,
        schema: schema.content,
        schemaStoreHandle: schemaHandle.content,
        instanceStoreHandle: instanceHandle.content,
    };
}

describe("API document store", () => {
    test("binds instance mutations to existing Automerge handles", async () => {
        const { binder, instanceLiveDoc, schema } = await createFixtureWithSchema();
        schema.add(Type, { label: "Person" });

        const instance = await binder.loadInstanceFromRef(schema, {
            id: instanceRef,
            version: null,
            server,
        });
        expect(instance.tag).toBe("Ok");
        if (instance.tag !== "Ok") {
            throw new Error("expected instance to load");
        }

        const validation = await instance.content.validate();
        expect(validation.issues).toEqual([]);
        const table = validation.tables.find((table) => table.label === "Person");
        expect(table).toBeDefined();
        if (!table) {
            throw new Error("expected entity table");
        }
        const added = await instance.content.addRow(table);
        expect(added.tag).toBe("Ok");
        // Tables are stored as a record keyed by the schema entity's UUID,
        // each with its rows keyed by row UUID alongside an ordering.
        expect(Object.keys(instanceLiveDoc.doc.tables)).toHaveLength(1);
        const storedTable = instanceLiveDoc.doc.tables[table.id];
        expect(storedTable?.rowOrder).toHaveLength(1);
        expect(Object.keys(storedTable?.rows ?? {})).toHaveLength(1);
    });

    test("instance views refresh after committing an unchanged schema draft", async () => {
        const {
            binder,
            schema,
            store,
            schemaAutomergeHandle,
            schemaStoreHandle,
            instanceStoreHandle,
        } = await createFixtureWithSchema();
        schema.add(Type, { label: "Person" });
        const result = await binder.loadInstanceFromRef(schema, {
            id: instanceRef,
            version: null,
            server,
        });
        if (result.tag !== "Ok") {
            throw new Error("expected instance to load");
        }
        const instance = result.content;
        const table = (await instance.validate()).tables[0];
        if (!table) {
            throw new Error("expected entity table");
        }
        const row = await instance.addRow(table);
        if (row.tag !== "Ok") {
            throw new Error("expected row to be added");
        }
        const { validation, dispose } = createRoot((dispose) => ({
            validation: createInstanceValidationView(instance),
            dispose,
        }));
        try {
            await expect.poll(() => validation()?.tables[0]?.rows.length).toBe(1);
            const before = store.getDocumentSnapshot(schemaStoreHandle);
            const rootBefore = schemaAutomergeHandle.doc();
            const schemaDraft = store.createDraft(schemaStoreHandle);
            const instanceDraft = store.createDraft(instanceStoreHandle);
            store.changeDocument(instanceDraft, (document) => {
                const stored = document as InstanceDocument;
                delete stored.tables[table.id]!.rows[row.content.id];
                stored.tables[table.id]!.rowOrder = [];
            });

            // LLM transactions merge the schema even when only instance rows changed.
            store.commitDraft(schemaStoreHandle, schemaDraft);
            expect(schemaAutomergeHandle.doc()).not.toBe(rootBefore);
            expect(store.getDocumentSnapshot(schemaStoreHandle)).toBe(before);
            store.commitDraft(instanceStoreHandle, instanceDraft);
            await expect.poll(() => validation()?.tables[0]?.rows.length).toBe(0);
        } finally {
            dispose();
        }
    });

    test("document snapshots apply map key deletions", async () => {
        const { binder, schema, store, instanceStoreHandle } = await createFixtureWithSchema();
        schema.add(Type, { label: "Person" });

        const instance = await binder.loadInstanceFromRef(schema, {
            id: instanceRef,
            version: null,
            server,
        });
        if (instance.tag !== "Ok") {
            throw new Error("expected instance to load");
        }
        const table = (await instance.content.validate()).tables[0];
        if (!table) {
            throw new Error("expected entity table");
        }
        const added = await instance.content.addRow(table);
        if (added.tag !== "Ok") {
            throw new Error("expected row to be added");
        }

        const before = store.getDocumentSnapshot(instanceStoreHandle) as InstanceDocument;
        expect(Object.keys(before.tables[table.id]?.rows ?? {})).toEqual([added.content.id]);

        instance.content.deleteRow(table.id, added.content.id);
        const after = store.getDocumentSnapshot(instanceStoreHandle) as InstanceDocument;
        expect(after.tables[table.id]?.rows).toEqual({});
        expect(after.tables[table.id]?.rowOrder).toEqual([]);
        expect(Object.keys(before.tables[table.id]?.rows ?? {})).toEqual([added.content.id]);
    });

    test("rejects a document with the wrong type", async () => {
        const { binder, schema } = await createFixtureWithSchema();

        const wrongType = await binder.loadInstanceFromRef(schema, {
            id: schemaRef,
            version: null,
            server,
        });

        expect(wrongType).toMatchObject({ tag: "Err", content: [{ path: ["type"] }] });
    });

    test("rejects instances of unsupported schema shapes", async () => {
        const { binder } = await createFixture();

        const unsupportedSchema = await binder.loadNotebookFromRef(
            defineShape({ theory: "simple-olog" }),
            { id: schemaRef, version: null, server },
        );
        expect(unsupportedSchema.tag).toBe("Ok");
        if (unsupportedSchema.tag === "Err") {
            throw new Error("expected unsupported schema to load as a notebook");
        }
        const unsupported = await binder.loadInstanceFromRef(unsupportedSchema.content, {
            id: instanceRef,
            version: null,
            server,
        });
        expect(unsupported).toMatchObject({ tag: "Err" });
    });

    test("document views are reactive projections", async () => {
        const { schema, store } = await createFixtureWithSchema();

        const handle = await store.getHandle({ id: schemaRef, version: null });
        expect(handle.tag).toBe("Ok");
        if (handle.tag === "Err") {
            throw new Error("expected local ref to resolve");
        }

        const names: string[] = [];
        const dispose = createRoot((dispose) => {
            const data = createDocumentDataView(() => schema);
            createRenderEffect(() => {
                names.push(data().name);
            });
            return dispose;
        });

        try {
            store.changeDocument(handle.content, (doc) => {
                doc.name = "Renamed";
            });
        } finally {
            dispose();
        }

        expect(names).toEqual(["", "Renamed"]);
        expect(schema.title).toBe("Renamed");
    });

    test("document snapshots tolerate rich text block markers", async () => {
        const { schemaAutomergeHandle, store } = await createFixture();

        // The ProseMirror integration stores paragraphs as block markers
        // inside the Automerge text of a rich text cell.
        const cell = Nb.newRichTextCell();
        schemaAutomergeHandle.change((doc) => {
            doc.notebook.cellContents[cell.id] = cell;
            doc.notebook.cellOrder.push(cell.id);
            const path = ["notebook", "cellContents", cell.id, "content"];
            splitBlock(doc, path, 0, { type: "paragraph", parents: [], attrs: {} });
            splice(doc, path, 1, 0, "Hello");
        });

        const local = await store.getHandle({ id: schemaRef, version: null });
        expect(local.tag).toBe("Ok");
        if (local.tag === "Err") {
            throw new Error("expected local ref to resolve");
        }
        const view = store.getDocumentSnapshot(local.content) as ModelDocument;
        expect(view.notebook.cellContents[cell.id]?.content).toContain("Hello");

        schemaAutomergeHandle.change((doc) => {
            const path = ["notebook", "cellContents", cell.id, "content"];
            splitBlock(doc, path, 6, { type: "paragraph", parents: [], attrs: {} });
            splice(doc, path, 7, 0, "World");
        });
        const updated = store.getDocumentSnapshot(local.content) as ModelDocument;
        expect(updated.notebook.cellContents[cell.id]?.content).toContain("World");
        expect(view.notebook.cellContents[cell.id]?.content).not.toContain("World");
    });

    test("resolves local refs to canonical cached handles", async () => {
        const { schemaAutomergeHandle, store } = await createFixture();

        const local = await store.getHandle({ id: schemaRef, version: null });
        expect(local.tag).toBe("Ok");
        if (local.tag === "Err") {
            throw new Error("expected local ref to resolve");
        }
        expect(local.content.automergeHandle).toBe(schemaAutomergeHandle);
        expect(local.content.ref.server).toBe(server);
    });

    test("lists documents related through the API, indexed by link type", async () => {
        const { instanceAutomergeHandle, schemaAutomergeHandle, store } = await createFixture();

        const schema = await store.getHandle({ id: schemaRef, version: null, server });
        expect(schema.tag).toBe("Ok");
        if (schema.tag === "Err") {
            throw new Error("expected schema ref to resolve");
        }
        const instance = await store.getHandle({ id: instanceRef, version: null, server });
        expect(instance.tag).toBe("Ok");
        if (instance.tag === "Err") {
            throw new Error("expected instance ref to resolve");
        }

        // The backend's ref ids are resolved back into store handles, and
        // relations of unknown types are dropped.
        expect(await store.listUsedBy(schema.content)).toEqual({
            "analysis-of": [],
            "diagram-in": [],
            "instance-of": [instance.content],
            "llmconversation-of": [],
            instantiation: [],
        });
        expect((await store.listUsedBy(schema.content))["instance-of"][0]?.automergeHandle).toBe(
            instanceAutomergeHandle,
        );

        expect(await store.listDependsOn(instance.content)).toEqual({
            "analysis-of": [],
            "diagram-in": [],
            "instance-of": [schema.content],
            "llmconversation-of": [],
            instantiation: [],
        });
        expect(
            (await store.listDependsOn(instance.content))["instance-of"][0]?.automergeHandle,
        ).toBe(schemaAutomergeHandle);

        // Documents without relations resolve to empty groups.
        expect(await store.listUsedBy(instance.content)).toEqual({
            "analysis-of": [],
            "diagram-in": [],
            "instance-of": [],
            "llmconversation-of": [],
            instantiation: [],
        });
        expect(await store.listDependsOn(schema.content)).toEqual({
            "analysis-of": [],
            "diagram-in": [],
            "instance-of": [],
            "llmconversation-of": [],
            instantiation: [],
        });
    });

    test("snapshots are stable, detached, and refresh without subscribers", async () => {
        const { schema, store, schemaStoreHandle } = await createFixtureWithSchema();
        const before = store.getDocumentSnapshot(schemaStoreHandle);
        expect(store.getDocumentSnapshot(schemaStoreHandle)).toBe(before);
        expect(() => structuredClone(before)).not.toThrow();
        schema.update({ title: "Changed" });
        const after = store.getDocumentSnapshot(schemaStoreHandle);
        expect(after).not.toBe(before);
        expect(after).toMatchObject({ name: "Changed" });
        expect(before).toMatchObject({ name: "" });
        expect(store.getDocumentSnapshot(schemaStoreHandle)).toBe(after);
    });

    test("subscriptions deliver handles without initial delivery", async () => {
        const { schema, store, schemaStoreHandle } = await createFixtureWithSchema();
        const received: object[] = [];
        const stop = store.subscribe(schemaStoreHandle, (handle) => {
            expect(handle).toBe(schemaStoreHandle);
            received.push(store.getDocumentSnapshot(handle));
        });
        expect(received).toEqual([]);
        schema.update({ title: "Changed" });
        expect(received).toEqual([store.getDocumentSnapshot(schemaStoreHandle)]);
        stop();
        stop();
        schema.update({ title: "Unobserved" });
        expect(received).toHaveLength(1);
    });

    test("edits during notifications preserve saved snapshots while reads reflect current state", async () => {
        const { schema, store, schemaStoreHandle } = await createFixtureWithSchema();
        const received: object[] = [];
        let outerSnapshot: object | undefined;
        const stopFirst = store.subscribe(schemaStoreHandle, (handle) => {
            const snapshot = store.getDocumentSnapshot(handle);
            if (snapshot.name === "Outer") {
                outerSnapshot = snapshot;
                schema.update({ title: "Inner" });
            }
        });
        const stopSecond = store.subscribe(schemaStoreHandle, (handle) =>
            received.push(store.getDocumentSnapshot(handle)),
        );
        schema.update({ title: "Outer" });
        // Automerge defers the listener's edit until the current change is delivered.
        expect(received).toMatchObject([{ name: "Outer" }, { name: "Inner" }]);
        expect(outerSnapshot).toMatchObject({ name: "Outer" });
        expect(store.getDocumentSnapshot(schemaStoreHandle)).toBe(received[1]);
        stopFirst();
        stopSecond();
    });

    test("drafts, commits, undo, and remote merges select fresh snapshots", async () => {
        const { store, schemaStoreHandle, schemaAutomergeHandle, repo } =
            await createFixtureWithSchema();
        const before = store.getDocumentSnapshot(schemaStoreHandle);
        const draft = store.createDraft(schemaStoreHandle);
        store.changeDocument(draft, (doc) => {
            doc.name = "Draft";
        });
        const draftSnapshot = store.getDocumentSnapshot(draft);
        expect(store.getDocumentSnapshot(schemaStoreHandle)).toBe(before);
        const change = store.commitDraft(schemaStoreHandle, draft);
        expect(store.getDocumentSnapshot(schemaStoreHandle)).toMatchObject({ name: "Draft" });
        store.revertCommit(schemaStoreHandle, change);
        expect(store.getDocumentSnapshot(schemaStoreHandle)).toMatchObject({ name: "" });
        expect(draftSnapshot).toMatchObject({ name: "Draft" });
        expect(before).toMatchObject({ name: "" });
        const remote = repo.clone(schemaAutomergeHandle);
        remote.change((doc) => {
            doc.name = "Remote";
        });
        schemaAutomergeHandle.merge(remote);
        expect(store.getDocumentSnapshot(schemaStoreHandle)).toMatchObject({
            name: "Remote",
        });
    });

    test("notebook dump returns a detached plain document", async () => {
        const { schema, store } = await createFixtureWithSchema();
        schema.add(Type, { label: "Person" });

        const local = await store.getHandle({ id: schemaRef, version: null });
        expect(local.tag).toBe("Ok");
        if (local.tag === "Err") {
            throw new Error("expected local ref to resolve");
        }
        const handle = local.content;

        const dumped = schema.dump();
        expect(dumped).not.toBe(store.getDocumentSnapshot(handle));
        expect(dumped).toEqual(store.getDocumentSnapshot(handle));

        // Mutating the dump does not write back to the notebook.
        dumped.name = "mutated dump";
        expect(schema.title).toBe("");
    });

    test("drafts resolve by their own refs while sources stay committed", async () => {
        const { store } = await createFixture();

        const local = await store.getHandle({ id: schemaRef, version: null });
        expect(local.tag).toBe("Ok");
        if (local.tag === "Err") {
            throw new Error("expected local ref to resolve");
        }
        const source = local.content;

        const draft = store.createDraft(source);
        const draftRef = store.getDocumentRef(draft);

        // The draft's own ref resolves to the draft, while the source's ref
        // keeps resolving to the committed document.
        const resolvedDraft = await store.getHandle(draftRef);
        expect(resolvedDraft.tag).toBe("Ok");
        if (resolvedDraft.tag === "Err") {
            throw new Error("expected the draft's ref to resolve");
        }
        expect(resolvedDraft.content).toBe(draft);
        const resolvedSource = await store.getHandle({ id: schemaRef, version: null });
        expect(resolvedSource.tag).toBe("Ok");
        if (resolvedSource.tag === "Err") {
            throw new Error("expected the source's ref to resolve");
        }
        expect(resolvedSource.content).toBe(source);

        store.commitDraft(source, draft);
        // Once committed, the draft's ref no longer resolves.
        expect((await store.getHandle(draftRef)).tag).toBe("Err");
    });

    test("transaction drafts do not mutate source projections (automerge-repo#721)", async () => {
        const { binder, schema } = await createFixtureWithSchema();

        const { tx, draftDocs } = await binder.beginTransaction({ schema });
        try {
            draftDocs.schema.add(Type, { label: "Person" });

            expect(draftDocs.schema.cellsOf(Type)).toHaveLength(1);
            expect(schema.cellsOf(Type)).toHaveLength(0);
        } finally {
            tx.abort();
        }
    });

    test("reverting a commit restores deleted rich text blocks", async () => {
        const { schemaAutomergeHandle, store } = await createFixture();

        const cell = Nb.newRichTextCell();
        const path = ["notebook", "cellContents", cell.id, "content"];
        schemaAutomergeHandle.change((doc) => {
            doc.notebook.cellContents[cell.id] = cell;
            doc.notebook.cellOrder.push(cell.id);
            splitBlock(doc, path, 0, { type: "paragraph", parents: [], attrs: {} });
            splice(doc, path, 1, 0, "Hello");
            splitBlock(doc, path, 6, { type: "paragraph", parents: [], attrs: {} });
            splice(doc, path, 7, 0, "World");
        });
        const twoParagraphs = spans(schemaAutomergeHandle.doc(), path);
        expect(twoParagraphs).toHaveLength(4);

        const local = await store.getHandle({ id: schemaRef, version: null });
        if (local.tag === "Err") {
            throw new Error("expected local ref to resolve");
        }
        const source = local.content;

        // Delete the second paragraph (its block marker plus text) in a draft.
        const draft = store.createDraft(source);
        store.changeDocument(draft, (doc) => {
            splice(doc as ModelDocument, path, 6, 6);
        });
        const change = store.commitDraft(source, draft);
        expect(spans(schemaAutomergeHandle.doc(), path)).toHaveLength(2);

        // The inverse diff re-inserts the block marker
        store.revertCommit(source, change);
        expect(spans(schemaAutomergeHandle.doc(), path)).toEqual(twoParagraphs);
    });

    test("discarded drafts stop resolving", async () => {
        const { store } = await createFixture();

        const local = await store.getHandle({ id: schemaRef, version: null });
        expect(local.tag).toBe("Ok");
        if (local.tag === "Err") {
            throw new Error("expected local ref to resolve");
        }
        const source = local.content;

        const draft = store.createDraft(source);
        const draftRef = store.getDocumentRef(draft);

        store.discardDraft(draft);
        expect((await store.getHandle(draftRef)).tag).toBe("Err");
    });
});
