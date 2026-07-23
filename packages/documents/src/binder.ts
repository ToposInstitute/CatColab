import type { Document } from "catcolab-document-types";
import { createWithAdapter, loadRefWithAdapter, loadWithAdapter } from "./document-adapter";
import { modelDocumentAdapter, type ModelDocument } from "./model-document";
import { attachModelNotebook, type Notebook } from "./notebook";
import type { Result } from "./result";
import type { Shape } from "./shape";
import { createPlainDocumentStore, type DocumentRef, type DocumentStore } from "./store";

export interface Binder<Handle = unknown> {
    createNotebook<S extends Shape & { readonly theory: string }>(
        shape: S,
        options: { title: string },
    ): Promise<Notebook<S, Handle>>;
    loadNotebook<S extends Shape & { readonly theory: string }>(
        shape: S,
        document: ModelDocument,
    ): Promise<Result<Notebook<S, Handle>>>;
    loadNotebookFromRef<S extends Shape & { readonly theory: string }>(
        shape: S,
        ref: DocumentRef,
    ): Promise<Result<Notebook<S, Handle>>>;
}

export function createBinder(): Binder<Document>;
export function createBinder<Handle>(store: DocumentStore<Handle>): Binder<Handle>;
export function createBinder<Handle>(
    store: DocumentStore<Handle> = createPlainDocumentStore() as unknown as DocumentStore<Handle>,
): Binder<Handle> {
    return {
        createNotebook<S extends Shape & { readonly theory: string }>(
            shape: S,
            options: { title: string },
        ): Promise<Notebook<S, Handle>> {
            return createWithAdapter(store, modelDocumentAdapter, shape, options, (handle) =>
                attachModelNotebook(store, handle, shape),
            );
        },
        loadNotebook<S extends Shape & { readonly theory: string }>(
            shape: S,
            document: ModelDocument,
        ): Promise<Result<Notebook<S, Handle>>> {
            return loadWithAdapter(store, modelDocumentAdapter, shape, document, (handle) =>
                attachModelNotebook(store, handle, shape),
            );
        },
        loadNotebookFromRef<S extends Shape & { readonly theory: string }>(
            shape: S,
            ref: DocumentRef,
        ): Promise<Result<Notebook<S, Handle>>> {
            return loadRefWithAdapter(store, modelDocumentAdapter, shape, ref, (handle) =>
                attachModelNotebook(store, handle, shape),
            );
        },
    };
}
