import { Repo } from "@automerge/automerge-repo";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

import { Instance as LegacyInstance, Model } from "catcolab-document-methods";
import { createBinder, type InstanceDocument } from "catcolab-documents";
import { makeLiveDoc } from "./document";
import { createApiDocumentStore } from "./document_store";
import type { Api } from "./types";

describe("API document store", () => {
    test("binds the instance API to existing Automerge handles", async () => {
        const repo = new Repo();
        const schemaRef = "schema-ref";
        const instanceRef = "instance-ref";
        const server = "test.catcolab.org";
        const schemaLiveDoc = makeLiveDoc(
            repo.create(Model.newModelDocument({ theory: "simple-olog" })),
        );
        const instanceLiveDoc = makeLiveDoc<InstanceDocument>(
            repo.create(
                LegacyInstance.newInstanceDocument({
                    _id: schemaRef,
                    _version: null,
                    _server: server,
                }),
            ),
        );
        const api = { serverHost: server } as Api;
        const store = createApiDocumentStore(api);
        store.register({ id: schemaRef, version: null, server }, schemaLiveDoc);
        store.register({ id: instanceRef, version: null, server }, instanceLiveDoc);
        const binder = createBinder(store);

        const schema = await binder.loadNotebookFromRef(SimpleOlog, {
            id: schemaRef,
            version: null,
            server,
        });
        expect(schema.tag).toBe("Ok");
        if (schema.tag !== "Ok") {
            throw new Error("expected schema to load");
        }
        const entity = schema.content.add(Type, { label: "Person" });

        const instance = await binder.loadInstanceFromRef(schema.content, {
            id: instanceRef,
            version: null,
            server,
        });
        expect(instance.tag).toBe("Ok");
        if (instance.tag !== "Ok") {
            throw new Error("expected instance to load");
        }

        instance.content.add(entity);
        expect(instanceLiveDoc.doc.tables).toHaveLength(1);
        expect(instanceLiveDoc.doc.tables[0]?.rows).toHaveLength(1);
    });
});
