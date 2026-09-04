// RFC-0006 "An Automerge and SolidJS binder for our backend".
//
// An approximation of a binder working with the CatColab backend and frontend
// using Automerge, SolidJS and the RPC client (mocked as `FakeBackend`):
// `createHandle` registers new documents with the backend, and `getHandle`
// resolves `DocumentRef`s back through it, so instantiations across notebooks
// validate.
import { getBackend, getObjectId } from "@automerge/automerge";
import type { DocHandle, DocumentId } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
import { createBinder, type DocumentStore, Instantiation } from "catcolab-documents";
import { FakeBackend } from "../helpers/fake_backend";

const backend = new FakeBackend();
const repo = backend.repo;

type StoreHandle = {
    docHandle: DocHandle<Document>;
    docView: Document;
};

const makeHandle = (docHandle: DocHandle<Document>): StoreHandle => ({
    docHandle,
    docView: makeDocumentProjection(docHandle),
});

const refByDocId = new Map<DocumentId, string>();
const handleByRefId = new Map<string, StoreHandle>();

const backendStore: DocumentStore<StoreHandle> = {
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
    getDocumentView: (handle) => handle.docView,
    changeDocument: (handle, fn) => handle.docHandle.change(fn),
    subscribe: (handle, callback) => {
        handle.docHandle.on("change", callback);
        return () => handle.docHandle.off("change", callback);
    },
    copyValue: (handle, value) => {
        const doc = handle.docHandle.doc();
        const objId = getObjectId(value as object);
        if (objId === null) {
            throw new Error("value is not part of the document");
        }
        return getBackend(doc).materialize(objId) as typeof value;
    },
    getDocumentRef: (handle) => {
        const refId = refByDocId.get(handle.docHandle.documentId);
        if (!refId) {
            throw new Error("handle is not registered with this store");
        }
        return { id: refId, version: null, server: backend.serverHost };
    },
    listInstancesOf: async (handle) => {
        const refId = refByDocId.get(handle.docHandle.documentId);
        if (!refId) {
            throw new Error("handle is not registered with this store");
        }
        const instances: StoreHandle[] = [];
        for (const other of handleByRefId.values()) {
            const doc = other.docView;
            if (other !== handle && doc.type === "instance" && doc.instanceOf._id === refId) {
                instances.push(other);
            }
        }
        return instances;
    },
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

describe.skip("backend binder", () => {
    test("notebooks with instantiations resolve through the backend and validate", async () => {
        const backendBinder = createBinder(backendStore);

        const imported = await backendBinder.createNotebook(SimpleOlog, { title: "Imported" });
        imported.add(Type, { label: "Thing" });

        const notebook = await backendBinder.createNotebook(SimpleOlog, { title: "Main" });
        notebook.add(Type, { label: "A" });
        notebook.add(Instantiation, { label: "ImportedOlog", model: imported });

        const result = await notebook.validate();
        expect(result.issues).toEqual([]);
    });
});
