import { Repo, type DocHandle } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "solid-automerge";
import { unwrap } from "solid-js/store";

import type { Document } from "catcolab-document-types";
import { type DocumentStore, emptyHandlesByLinkType } from "catcolab-documents";

type Handle = { docHandle: DocHandle<Document>; view: Document };

export function createProjectedStore(): DocumentStore<Handle> {
    const repo = new Repo();
    const handles = new Map<string, Handle>();

    return {
        async createHandle(initialDoc) {
            const docHandle = repo.create(initialDoc);
            const handle = { docHandle, view: makeDocumentProjection(docHandle) };
            handles.set(docHandle.documentId, handle);
            return handle;
        },
        async getHandle(ref) {
            const handle = handles.get(ref.id);
            return handle
                ? { tag: "Ok", content: handle }
                : { tag: "Err", content: [{ message: `Unknown document: ${ref.id}` }] };
        },
        changeDocument: (handle, fn) => handle.docHandle.change(fn),
        subscribe(handle, callback) {
            handle.docHandle.on("change", callback);
            return () => handle.docHandle.off("change", callback);
        },
        copyValue: (_handle, value) => structuredClone(unwrap(value)),
        getDocumentRef: (handle) => ({ id: handle.docHandle.documentId, version: null }),
        getDocumentView: (handle) => handle.view,
        listUsedBy: async () => emptyHandlesByLinkType(),
        listDependsOn: async () => emptyHandlesByLinkType(),
        createDraft: () => {
            throw new Error("Drafts are not used by this fixture.");
        },
        commitDraft: () => {
            throw new Error("Drafts are not used by this fixture.");
        },
        discardDraft: () => {
            throw new Error("Drafts are not used by this fixture.");
        },
        revertCommit: () => {
            throw new Error("Drafts are not used by this fixture.");
        },
    };
}
