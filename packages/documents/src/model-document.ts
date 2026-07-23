import type { ModelDocument } from "catcolab-document-methods";
import type { DocumentStore } from "./store";

export type { ModelDocument } from "catcolab-document-methods";

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
    ? T
    : T extends readonly (infer Item)[]
      ? readonly DeepReadonly<Item>[]
      : T extends object
        ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
        : T;

export type ModelDocumentView = DeepReadonly<ModelDocument>;

export function getModelDocumentView<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
): Readonly<ModelDocument> {
    const document = store.getDocumentView(handle);
    if (document.type !== "model") {
        throw new Error(`Expected a model document, received "${document.type}".`);
    }
    return document as Readonly<ModelDocument>;
}

export function changeModelDocument<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    change: (document: ModelDocument) => void,
): void {
    store.changeDocument(handle, (document) => {
        if (document.type !== "model") {
            throw new Error(`Expected a model document, received "${document.type}".`);
        }
        change(document);
    });
}
