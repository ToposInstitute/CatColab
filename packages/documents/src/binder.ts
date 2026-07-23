import { Model } from "catcolab-document-methods";
import type { Document } from "catcolab-document-types";
import type { ModelDocument } from "./model-document";
import { notebookFromDocument, type Notebook } from "./notebook";
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
        async createNotebook<S extends Shape & { readonly theory: string }>(
            shape: S,
            options: { title: string },
        ) {
            const document = Model.newModelDocument({ theory: shape.theory });
            document.name = options.title;
            const handle = await store.createHandle(document);
            return notebookFromDocument(store, handle, shape);
        },
        async loadNotebook<S extends Shape & { readonly theory: string }>(
            shape: S,
            document: ModelDocument,
        ): Promise<Result<Notebook<S, Handle>>> {
            if (document.theory !== shape.theory) {
                return theoryMismatch(shape.theory, document.theory);
            }
            const handle = await store.createHandle(document);
            return { tag: "Ok", content: notebookFromDocument(store, handle, shape) };
        },
        async loadNotebookFromRef<S extends Shape & { readonly theory: string }>(
            shape: S,
            ref: DocumentRef,
        ): Promise<Result<Notebook<S, Handle>>> {
            const resolved = await store.getHandle(ref);
            if (resolved.tag === "Err") {
                return resolved;
            }
            const document = store.getDocumentView(resolved.content);
            if (document.type !== "model") {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: `Cannot load a document of type "${document.type}" as a model.`,
                            path: ["type"],
                        },
                    ],
                };
            }
            if (document.theory !== shape.theory) {
                return theoryMismatch(shape.theory, document.theory);
            }
            return {
                tag: "Ok",
                content: notebookFromDocument(store, resolved.content, shape),
            };
        },
    };
}

function theoryMismatch(expected: string, actual: string): Result<never> {
    return {
        tag: "Err",
        content: [
            {
                message:
                    `Cannot load document with theory "${actual}" ` +
                    `using a shape with theory "${expected}".`,
                path: ["theory"],
            },
        ],
    };
}
