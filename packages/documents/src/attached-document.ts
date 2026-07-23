import type { Document } from "catcolab-document-types";
import {
    changeDocumentOfType,
    getDocumentViewOfType,
    type DocumentOfType,
    type DocumentView,
} from "./document";
import type { DocumentRef, DocumentStore } from "./store";

export interface AttachedDocument<D extends Document, Handle> {
    readonly handle: Handle;
    readonly document: DocumentView<D>;
    readonly title: string;

    update(patch: Partial<{ title: string }>): void;
    dump(): D;
    onChange(callback: () => void): () => void;
}

const references = new WeakMap<object, () => DocumentRef>();

export function getAttachedDocumentRef(document: object): DocumentRef {
    const getRef = references.get(document);
    if (!getRef) {
        throw new Error("Document API is not attached to a document reference.");
    }
    return getRef();
}

export function attachDocument<Handle, Type extends Document["type"]>(
    store: DocumentStore<Handle>,
    handle: Handle,
    type: Type,
): AttachedDocument<DocumentOfType<Type>, Handle> {
    const attached: AttachedDocument<DocumentOfType<Type>, Handle> = {
        handle,
        get document() {
            return getDocumentViewOfType(store, handle, type) as DocumentView<DocumentOfType<Type>>;
        },
        get title() {
            return getDocumentViewOfType(store, handle, type).name;
        },
        update(patch) {
            if (patch.title !== undefined) {
                changeDocumentOfType(store, handle, type, (document) => {
                    document.name = patch.title as string;
                });
            }
        },
        dump() {
            const document = getDocumentViewOfType(store, handle, type);
            return store.copyValue(handle, document) as DocumentOfType<Type>;
        },
        onChange(callback) {
            return store.subscribe(handle, callback);
        },
    };
    references.set(attached, () => store.getDocumentRef(handle));
    return attached;
}
