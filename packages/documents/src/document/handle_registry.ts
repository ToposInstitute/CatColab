import type { DocumentStore } from "../document-store";

declare const handleType: unique symbol;

export interface DocumentOwner<H> {
    readonly [handleType]?: H;
}

const handlesByStore = new WeakMap<object, WeakMap<object, unknown>>();

export function registerDocument<H, V, D extends object>(
    store: DocumentStore<H, V>,
    handle: H,
    document: D,
): D {
    let handles = handlesByStore.get(store);
    if (!handles) {
        handles = new WeakMap();
        handlesByStore.set(store, handles);
    }
    handles.set(document, handle);
    return document;
}

export function getBoundHandle<H, V>(store: DocumentStore<H, V>, document: object): H {
    const handles = handlesByStore.get(store);
    if (!handles?.has(document)) {
        throw new Error("The document is not bound to this store.");
    }
    return handles.get(document) as H;
}
