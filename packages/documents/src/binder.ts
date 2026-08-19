import { Instance as InstanceMethods, Model } from "catcolab-document-methods";
import type { Document } from "catcolab-document-types";
import type { DocumentStore } from "./document-store";
import { createInMemoryStore } from "./document-store";
import { instanceFromStore, type Instance } from "./instance/instance";
import type { ModelDocument } from "./model/document";
import { modelNotebookFromStore, type Notebook } from "./model/notebook";
import type { Result } from "./result";
import type { Shape } from "./shape";

export interface Binder<Handle> {
    /** The document store backing this binder. */
    readonly store: DocumentStore<Handle>;

    createNotebook<S extends Shape & { readonly theory: string }>(
        shape: S,
        options: { title: string },
    ): Promise<Notebook<S, ModelDocument, Handle>>;

    createInstance<S extends Shape>(
        schema: Notebook<S, ModelDocument, Handle>,
        options: { title: string },
    ): Promise<Result<Instance<Handle, S>>>;
}

/* Overloads rather than a single signature `createBinder<Handle>(store?:
   DocumentStore<Handle>)`: a single optional-parameter signature would allow
   the nonsensical pattern `createBinder<S>()` for some concrete S, which the
   implementation would have to ignore. With overloads, an explicit type
   argument requires the store argument, the zero-argument form takes no type
   arguments, and the zero-argument form's return type is specific to the
   in-memory store's handle type.
 */
export function createBinder(): Binder<Document>;
export function createBinder<Handle>(store: DocumentStore<Handle>): Binder<Handle>;
export function createBinder<Handle>(
    store?: DocumentStore<Handle>,
): Binder<Document> | Binder<Handle> {
    return store === undefined ? binderFromStore(createInMemoryStore()) : binderFromStore(store);
}

function binderFromStore<Handle>(store: DocumentStore<Handle>): Binder<Handle> {
    return {
        store,
        async createNotebook<S extends Shape & { readonly theory: string }>(
            shape: S,
            options: { title: string },
        ) {
            const document = Model.newModelDocument({
                theory: shape.theory,
            });
            document.name = options.title;

            const handle = await store.createHandle(document);

            return modelNotebookFromStore(shape, store, handle);
        },
        async createInstance<S extends Shape>(
            schema: Notebook<S, ModelDocument, Handle>,
            options: { title: string },
        ) {
            const shape = schema.shape;
            if (shape.supportsInstances === undefined) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: `Shape \`${shape.theory ?? "unnamed"}\` does not support instances`,
                        },
                    ],
                };
            }

            const schemaResult = await schema.validate();
            if (schemaResult.tag === "Err") {
                return schemaResult;
            }

            const schemaModel = schemaResult.content;
            try {
                const schemaRef = store.getDocumentRef(schema.handle);
                const document = InstanceMethods.newInstanceDocument({
                    _id: schemaRef.id,
                    _version: schemaRef.version,
                    _server: schemaRef.server ?? "",
                });
                document.name = options.title;

                const handle = await store.createHandle(document);
                return {
                    tag: "Ok",
                    content: instanceFromStore(shape, schema, store, handle),
                };
            } finally {
                schemaModel.free();
            }
        },
    };
}
