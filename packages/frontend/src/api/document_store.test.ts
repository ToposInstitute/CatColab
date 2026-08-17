import { type DocHandle, Repo } from "@automerge/automerge-repo";
import { afterAll, describe, expect, test } from "vitest";

import { Model } from "catcolab-document-methods";
import type { Document } from "catcolab-document-types";
import { makeLiveDoc } from "./document";
import { createApiDocumentStore, type DocumentStoreApi } from "./document_store";

const repo = new Repo();
const documents = new Map<string, DocHandle<Document>>();
let nextRefId = 0;

const api: DocumentStoreApi = {
    serverHost: "catcolab.test",
    async createDoc(initialDoc) {
        const refId = `ref-${nextRefId++}`;
        documents.set(refId, repo.create<Document>(initialDoc));
        return refId;
    },
    async getLiveDoc(refId, docType) {
        const docHandle = documents.get(refId);
        if (!docHandle) {
            throw new Error(`Document "${refId}" does not exist.`);
        }
        return {
            liveDoc: makeLiveDoc(docHandle, docType),
            docRef: {
                refId,
                permissions: { anyone: null, user: null, users: null },
                isDeleted: false,
            },
        };
    },
};

const store = createApiDocumentStore(api);

afterAll(() => {
    void repo.shutdown();
});

describe("API document store", () => {
    test("creates, changes, subscribes to, and resolves documents", async () => {
        const document = Model.newModelDocument({ theory: "simple-olog" });
        document.name = "An Olog";

        const handle = await store.createHandle(document);
        const ref = store.getDocumentRef(handle);
        expect(ref).toEqual({ id: "ref-0", version: null, server: "catcolab.test" });
        expect(store.getDocumentView(handle).name).toBe("An Olog");

        let changes = 0;
        const unsubscribe = store.subscribe(handle, () => {
            changes += 1;
        });

        store.changeDocument(handle, (storedDocument) => {
            storedDocument.name = "Changed locally";
        });
        expect(store.getDocumentView(handle).name).toBe("Changed locally");
        expect(changes).toBe(1);

        handle.liveDoc.docHandle.change((storedDocument) => {
            storedDocument.name = "Changed outside the store";
        });
        expect(store.getDocumentView(handle).name).toBe("Changed outside the store");
        expect(changes).toBe(2);

        unsubscribe();

        const resolved = await store.getHandle(ref);
        expect(resolved).toEqual({ tag: "Ok", content: handle });

        const copy = store.copyValue(handle, store.getDocumentView(handle));
        expect(copy).toEqual(store.getDocumentView(handle));
        expect(copy).not.toBe(store.getDocumentView(handle));
    });

    test("rejects unsupported document references", async () => {
        const versioned = await store.getHandle({
            id: "ref-0",
            version: "version",
            server: "catcolab.test",
        });
        expect(versioned.tag).toBe("Err");

        const remote = await store.getHandle({
            id: "ref-0",
            version: null,
            server: "elsewhere.test",
        });
        expect(remote.tag).toBe("Err");
    });
});
