import { Repo, type DocHandle } from "@automerge/automerge-repo";

import type { Document } from "catcolab-document-types";
import { type DocumentStore, emptyHandlesByLinkType } from "catcolab-documents";
import { createDocumentSnapshot } from "./document_snapshot";

type Handle = { docHandle: DocHandle<Document> };

export function createProjectedStore(): DocumentStore<Handle> {
    const repo = new Repo();
    const handles = new Map<string, Handle>();
    const snapshotOf = createDocumentSnapshot();
    const getDocumentSnapshot = (handle: Handle) => snapshotOf(handle.docHandle.doc());

    return {
        async createHandle(initialDoc) {
            const docHandle = repo.create(initialDoc);
            const handle = { docHandle };
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
            const onChange = ({ doc }: { doc: Document }) => callback(snapshotOf(doc));
            handle.docHandle.on("change", onChange);
            return () => handle.docHandle.off("change", onChange);
        },
        getDocumentRef: (handle) => ({ id: handle.docHandle.documentId, version: null }),
        getDocumentSnapshot,
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
