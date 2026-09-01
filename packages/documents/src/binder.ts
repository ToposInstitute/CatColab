import {
    Instance as InstanceMethods,
    LLMConversation as LLMConversationMethods,
    Model,
} from "catcolab-document-methods";
import type { Document } from "catcolab-document-types";
import type { DocumentRef, DocumentStore } from "./document-store";
import { createInMemoryStore } from "./document-store";
import { instanceFromStore, type Instance } from "./instance/instance";
import {
    type LLMConversation,
    type LLMConversationAttachment,
    llmConversationFromStore,
} from "./llm-conversation";
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

    loadNotebookFromRef<S extends Shape & { readonly theory: string }>(
        shape: S,
        ref: DocumentRef,
    ): Promise<Result<Notebook<S, ModelDocument, Handle>>>;

    createInstance<S extends Shape>(
        schema: Notebook<S, ModelDocument, Handle>,
        options: { title: string },
    ): Promise<Result<Instance<Handle, S>>>;

    createLLMConversation<Attachment extends LLMConversationAttachment<Shape, Handle>>(
        attachment: Attachment,
        llmModel: string,
        options: { title: string },
    ): Promise<LLMConversation<Attachment, Handle>>;

    loadInstanceFromRef<S extends Shape>(
        schema: Notebook<S, ModelDocument, Handle>,
        ref: DocumentRef,
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
        async loadNotebookFromRef<S extends Shape & { readonly theory: string }>(
            shape: S,
            ref: DocumentRef,
        ) {
            const result = await store.getHandle(ref);
            if (result.tag === "Err") {
                return result;
            }

            const document = store.getDocumentView(result.content);
            if (document.type !== "model") {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: `Cannot load document of type "${document.type}" as a notebook.`,
                            path: ["type"],
                        },
                    ],
                };
            }
            if (document.theory !== shape.theory) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message:
                                `Cannot load document with theory "${document.theory}"` +
                                `using shape "${shape.theory}".`,
                            path: ["theory"],
                        },
                    ],
                };
            }

            return {
                tag: "Ok",
                content: modelNotebookFromStore(shape, store, result.content),
            };
        },
        async createInstance<S extends Shape>(
            schema: Notebook<S, ModelDocument, Handle>,
            options: { title: string },
        ) {
            const shape = schema.shape;
            if (!shape.supportsInstances) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: `Shape \`${shape.theory ?? "unnamed"}\` does not support instances`,
                        },
                    ],
                };
            }

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
        },
        async createLLMConversation<Attachment extends LLMConversationAttachment<Shape, Handle>>(
            attachment: Attachment,
            llmModel: string,
            options: { title: string },
        ) {
            const attachmentRef = store.getDocumentRef(attachment.handle);
            const document = LLMConversationMethods.newLLMConversationDocument(
                {
                    _id: attachmentRef.id,
                    _version: attachmentRef.version,
                    _server: attachmentRef.server ?? "",
                },
                llmModel,
            );
            document.name = options.title;

            const handle = await store.createHandle(document);
            return llmConversationFromStore(store, handle, attachment);
        },
        async loadInstanceFromRef<S extends Shape>(
            schema: Notebook<S, ModelDocument, Handle>,
            ref: DocumentRef,
        ) {
            if (!schema.shape.supportsInstances) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: `Shape${schema.shape.theory ? ' "' + schema.shape.theory + '"' : ""} does not support instances`,
                        },
                    ],
                };
            }

            const result = await store.getHandle(ref);
            if (result.tag === "Err") {
                return result;
            }

            const document = store.getDocumentView(result.content);
            if (document.type !== "instance") {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: `Cannot load document of type "${document.type}" as an instance.`,
                            path: ["type"],
                        },
                    ],
                };
            }

            const schemaRef = store.getDocumentRef(schema.handle);
            if (
                document.instanceOf._id !== schemaRef.id ||
                document.instanceOf._version !== schemaRef.version ||
                document.instanceOf._server !== (schemaRef.server ?? "")
            ) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message:
                                `Cannot load instance of schema "${document.instanceOf._id}" ` +
                                `using schema "${schemaRef.id}".`,
                            path: ["instanceOf"],
                        },
                    ],
                };
            }

            return {
                tag: "Ok",
                content: instanceFromStore(schema.shape, schema, store, result.content),
            };
        },
    };
}
