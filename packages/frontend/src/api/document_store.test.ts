import { Repo } from "@automerge/automerge-repo";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

import { Instance as LegacyInstance, Model } from "catcolab-document-methods";
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

        const tables = await instance.content.tables();
        expect(tables.tag).toBe("Ok");
        if (tables.tag !== "Ok") {
            throw new Error("expected tables to load");
        }
        const table = tables.content.find((table) => table.label === "Person");
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
});
