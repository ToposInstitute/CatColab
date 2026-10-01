import { Repo, type DocHandle } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "solid-automerge";
import { createSignal } from "solid-js";
import { unwrap } from "solid-js/store";

import type { Document } from "catcolab-document-types";
import { type DocumentStore, emptyHandlesByLinkType } from "catcolab-documents";

type Handle = {
    docHandle: DocHandle<Document>;
    view: Document;
    revision: () => number;
    bumpRevision: () => void;
};

export function createProjectedStore(): DocumentStore<Handle> {
    const repo = new Repo();
    const handles = new Map<string, Handle>();

    return {
        async createHandle(initialDoc) {
            const docHandle = repo.create(initialDoc);
            const [revision, setRevision] = createSignal(0);
            const handle = {
                docHandle,
                view: makeDocumentProjection(docHandle),
                revision,
                bumpRevision: () => {
                    setRevision((value) => value + 1);
                },
            };
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
            const onChange = () => {
                callback();
                handle.bumpRevision();
            };
            handle.docHandle.on("change", onChange);
            return () => handle.docHandle.off("change", onChange);
        },
        copyValue: (_handle, value) => structuredClone(unwrap(value)),
        getDocumentRef: (handle) => ({ id: handle.docHandle.documentId, version: null }),
        getDocumentView: (handle) => handle.view,
        getDocumentSnapshot: (handle) => handle.docHandle.doc(),
        getDocumentRevision: (handle) => handle.revision(),
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
