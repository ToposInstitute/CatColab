// @vitest-environment happy-dom
// The happy-dom environment makes solid-js resolve to its reactive client
// build, which the reactive projection tests depend on.
import { getObjectId } from "@automerge/automerge";
import { Repo } from "@automerge/automerge-repo";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createRenderEffect, createRoot } from "solid-js";
import { unwrap } from "solid-js/store";
import { describe, expect, test } from "vitest";

import { Instance as LegacyInstance, Model, type ModelDocument } from "catcolab-document-methods";
import { createBinder, defineShape, type InstanceDocument } from "catcolab-documents";
import { makeLiveDoc } from "./document";
import { createApiDocumentStore } from "./document_store";
import type { Api } from "./types";

const schemaRef = "schema-ref";
const instanceRef = "instance-ref";
const server = "test.catcolab.org";

function createFixture() {
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
    const store = createApiDocumentStore(api);

    return {
        binder: createBinder(store),
        instanceLiveDoc,
        schemaAutomergeHandle,
        store,
    };
}

async function createFixtureWithSchema() {
    const fixture = createFixture();
    const schema = await fixture.binder.loadNotebookFromRef(SimpleOlog, {
        id: schemaRef,
        version: null,
        server,
    });
    expect(schema.tag).toBe("Ok");
    if (schema.tag !== "Ok") {
        throw new Error("expected schema to load");
    }

    return { ...fixture, schema: schema.content };
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

    test("document views apply map key deletions", async () => {
        const { binder, schema, store } = await createFixtureWithSchema();
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

        const view = store.getDocumentView(instance.content.handle) as InstanceDocument;
        expect(Object.keys(view.tables[table.id]?.rows ?? {})).toEqual([added.content.id]);

        instance.content.deleteRow(table.id, added.content.id);
        expect(view.tables[table.id]?.rows).toEqual({});
        expect(view.tables[table.id]?.rowOrder).toEqual([]);
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
        const { binder } = createFixture();

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
            createRenderEffect(() => {
                names.push(store.getDocumentView(handle.content).name);
            });
            return dispose;
        });

        store.changeDocument(handle.content, (doc) => {
            doc.name = "Renamed";
        });
        dispose();

        expect(names).toEqual(["", "Renamed"]);
        expect(schema.title).toBe("Renamed");
    });

    test("resolves local refs to canonical cached handles", async () => {
        const { schemaAutomergeHandle, store } = createFixture();

        const local = await store.getHandle({ id: schemaRef, version: null });
        expect(local.tag).toBe("Ok");
        if (local.tag === "Err") {
            throw new Error("expected local ref to resolve");
        }
        expect(local.content.automergeHandle).toBe(schemaAutomergeHandle);
        expect(local.content.ref.server).toBe(server);
    });

    test("copyValue detaches Solid projection values", async () => {
        const { store } = createFixture();

        const local = await store.getHandle({ id: schemaRef, version: null });
        expect(local.tag).toBe("Ok");
        if (local.tag === "Err") {
            throw new Error("expected local ref to resolve");
        }
        const handle = local.content;

        const view = store.getDocumentView(handle) as ModelDocument;
        const copy = store.copyValue(handle, view);

        // A genuine deep copy: neither the store proxy nor its raw target.
        expect(copy).not.toBe(view);
        expect(copy).not.toBe(unwrap(view));
        expect(copy).toEqual(unwrap(view));
        expect(copy.notebook).not.toBe(unwrap(view).notebook);

        // Mutating the copy leaves the document untouched.
        copy.name = "mutated copy";
        expect(store.getDocumentView(handle).name).toBe("");

        // Mutating the document leaves the copy stale.
        store.changeDocument(handle, (doc) => {
            doc.name = "changed";
        });
        expect(copy.name).toBe("mutated copy");
    });

    test("copyValue detaches Automerge proxy values", async () => {
        const { schemaAutomergeHandle, store } = createFixture();

        const local = await store.getHandle({ id: schemaRef, version: null });
        expect(local.tag).toBe("Ok");
        if (local.tag === "Err") {
            throw new Error("expected local ref to resolve");
        }
        const handle = local.content;

        const notebook = (schemaAutomergeHandle.doc() as ModelDocument).notebook;
        expect(getObjectId(notebook)).not.toBeNull();

        const copy = store.copyValue(handle, notebook);
        expect(copy).not.toBe(notebook);
        expect(copy).toEqual(notebook);

        // Mutating the copy succeeds (an Automerge proxy would throw outside a
        // change context) and does not touch the document.
        copy.cellOrder.push("bogus-cell");
        expect((schemaAutomergeHandle.doc() as ModelDocument).notebook.cellOrder).toHaveLength(0);
    });

    test("copyValue passes primitives through", async () => {
        const { store } = createFixture();

        const local = await store.getHandle({ id: schemaRef, version: null });
        expect(local.tag).toBe("Ok");
        if (local.tag === "Err") {
            throw new Error("expected local ref to resolve");
        }
        const handle = local.content;

        expect(store.copyValue(handle, 42)).toBe(42);
        expect(store.copyValue(handle, "x")).toBe("x");
        expect(store.copyValue(handle, null)).toBeNull();
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
        expect(dumped).not.toBe(store.getDocumentView(handle));
        expect(dumped).toEqual(unwrap(store.getDocumentView(handle)));

        // Mutating the dump does not write back to the notebook.
        dumped.name = "mutated dump";
        expect(schema.title).toBe("");
    });

    test("drafts resolve by their own refs while sources stay committed", async () => {
        const { store } = createFixture();

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

    test("discarded drafts stop resolving", async () => {
        const { store } = createFixture();

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
