import { getOwner, onCleanup } from "solid-js";
import { createStore, reconcile, type SetStoreFunction, unwrap } from "solid-js/store";

import type { Document } from "catcolab-document-types";
import {
    type DocumentStore,
    getDocumentSnapshot,
    type HandlesByLinkType,
    type Result,
} from "catcolab-documents";

type ReactiveDocument = {
    view: Document;
    setView: SetStoreFunction<Document>;
    listeners: Set<() => void>;
    unsubscribe: () => void;
};

export interface SolidDocumentStore<Handle, Version = unknown> extends DocumentStore<
    Handle,
    Version
> {
    dispose(): void;
}

/** Add Solid document projections to a framework-neutral document store. */
export function createSolidDocumentStore<Handle, Version>(
    base: DocumentStore<Handle, Version>,
): SolidDocumentStore<Handle, Version> {
    const documents = new Map<Handle, ReactiveDocument>();

    const copyDocument = (handle: Handle): Document => {
        const snapshot = getDocumentSnapshot(base, handle);
        return (base.getDocumentSnapshot ? snapshot : base.copyValue(handle, snapshot)) as Document;
    };

    const reactiveDocument = (handle: Handle): ReactiveDocument => {
        const existing = documents.get(handle);
        if (existing) {
            return existing;
        }

        const [view, setView] = createStore(copyDocument(handle));
        const listeners = new Set<() => void>();
        const document: ReactiveDocument = {
            view,
            setView,
            listeners,
            unsubscribe: () => {},
        };
        document.unsubscribe = base.subscribe(handle, () => {
            setView(reconcile(copyDocument(handle)));
            for (const listener of Array.from(listeners)) {
                listener();
            }
        });
        documents.set(handle, document);
        return document;
    };

    const release = (handle: Handle): void => {
        const document = documents.get(handle);
        if (document) {
            document.unsubscribe();
            documents.delete(handle);
        }
    };

    const store: SolidDocumentStore<Handle, Version> = {
        createHandle: (initialDoc) => base.createHandle(initialDoc),
        getHandle: (ref): Promise<Result<Handle>> => base.getHandle(ref),
        changeDocument: (handle, fn) => base.changeDocument(handle, fn),
        subscribe(handle, callback) {
            const document = reactiveDocument(handle);
            document.listeners.add(callback);
            return () => document.listeners.delete(callback);
        },
        copyValue: (handle, value) => base.copyValue(handle, unwrap(value)),
        getDocumentRef: (handle) => base.getDocumentRef(handle),
        getDocumentView: (handle) => reactiveDocument(handle).view,
        getDocumentSnapshot: (handle) => getDocumentSnapshot(base, handle),
        listUsedBy: (handle): Promise<HandlesByLinkType<Handle>> => base.listUsedBy(handle),
        listDependsOn: (handle): Promise<HandlesByLinkType<Handle>> => base.listDependsOn(handle),
        createDraft: (handle) => base.createDraft(handle),
        commitDraft(handle, draft) {
            const change = base.commitDraft(handle, draft);
            release(draft);
            return change;
        },
        discardDraft(draft) {
            release(draft);
            base.discardDraft(draft);
        },
        revertCommit: (handle, change) => base.revertCommit(handle, change),
        dispose() {
            for (const document of documents.values()) {
                document.unsubscribe();
            }
            documents.clear();
        },
    };

    if (getOwner()) {
        onCleanup(() => store.dispose());
    }
    return store;
}
