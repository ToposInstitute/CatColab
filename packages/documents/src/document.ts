import type { Document } from "catcolab-document-types";
import type { DocumentStore } from "./store";

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
    ? T
    : T extends readonly (infer Item)[]
      ? readonly DeepReadonly<Item>[]
      : T extends object
        ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
        : T;

export type DocumentOfType<Type extends Document["type"]> = Extract<Document, { type: Type }>;

export type DocumentView<D extends Document> = DeepReadonly<D>;

export function getDocumentViewOfType<Handle, Type extends Document["type"]>(
    store: DocumentStore<Handle>,
    handle: Handle,
    type: Type,
): Readonly<DocumentOfType<Type>> {
    const document = store.getDocumentView(handle);
    if (document.type !== type) {
        throw new Error(`Expected a ${type} document, received "${document.type}".`);
    }
    return document as Readonly<DocumentOfType<Type>>;
}

export function changeDocumentOfType<Handle, Type extends Document["type"]>(
    store: DocumentStore<Handle>,
    handle: Handle,
    type: Type,
    change: (document: DocumentOfType<Type>) => void,
): void {
    store.changeDocument(handle, (document) => {
        if (document.type !== type) {
            throw new Error(`Expected a ${type} document, received "${document.type}".`);
        }
        change(document as DocumentOfType<Type>);
    });
}
