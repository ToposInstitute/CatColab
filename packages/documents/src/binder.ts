import {
    Instance as InstanceMethods,
    LLMConversation as LLMConversationMethods,
    Model,
} from "catcolab-document-methods";
import type { Document } from "catcolab-document-types";
import type { DocumentRef, DocumentStore } from "./document-store";
import { createInMemoryStore } from "./document-store";
import type { DocumentChange } from "./document-store";
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
import type { SupportedDocument } from "./supported-document";
import type { Commit, Transaction } from "./transaction";

export interface Binder<Handle, Version> {
    /** The document store backing this binder. */
    readonly store: DocumentStore<Handle, Version>;

    createNotebook<S extends Shape & { readonly theory: string }>(
        shape: S,
        options: { title: string },
    ): Promise<Notebook<S, ModelDocument, Handle, Version>>;

    loadNotebookFromRef<S extends Shape & { readonly theory: string }>(
        shape: S,
        ref: DocumentRef,
    ): Promise<Result<Notebook<S, ModelDocument, Handle, Version>>>;

    createInstance<S extends Shape>(
        schema: Notebook<S, ModelDocument, Handle, Version>,
        options: { title: string },
    ): Promise<Result<Instance<Handle, S, Version>>>;

    createLLMConversation<Attachment extends LLMConversationAttachment<Shape, Handle, Version>>(
        attachment: Attachment,
        llmModel: string,
        options: { title: string },
    ): Promise<LLMConversation<Attachment, Handle>>;

    loadInstanceFromRef<S extends Shape>(
        schema: Notebook<S, ModelDocument, Handle, Version>,
        ref: DocumentRef,
    ): Promise<Result<Instance<Handle, S, Version>>>;

    beginTransaction<Docs extends Record<string, SupportedDocument<Shape, Handle, Version>>>(
        docs: Docs,
    ): Promise<{ tx: Transaction<Handle, Version>; draftDocs: Docs }>;
}

/* Overloads rather than a single signature `createBinder<Handle, Version>(store?:
   DocumentStore<Handle, Version>)`: a single optional-parameter signature would
   allow the nonsensical pattern `createBinder<S>()` for some concrete S, which
   the implementation would have to ignore. With overloads, an explicit type
   argument requires the store argument, the zero-argument form takes no type
   arguments, and the zero-argument form's return type is specific to the
   in-memory store's handle and version types.
 */
export function createBinder(): Binder<Document, Document>;
export function createBinder<Handle, Version>(
    store: DocumentStore<Handle, Version>,
): Binder<Handle, Version>;
export function createBinder<Handle, Version>(
    store?: DocumentStore<Handle, Version>,
): Binder<Document, Document> | Binder<Handle, Version> {
    return store === undefined ? binderFromStore(createInMemoryStore()) : binderFromStore(store);
}

function binderFromStore<Handle, Version>(
    store: DocumentStore<Handle, Version>,
): Binder<Handle, Version> {
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
            schema: Notebook<S, ModelDocument, Handle, Version>,
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
        async createLLMConversation<
            Attachment extends LLMConversationAttachment<Shape, Handle, Version>,
        >(attachment: Attachment, llmModel: string, options: { title: string }) {
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
            schema: Notebook<S, ModelDocument, Handle, Version>,
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
        async beginTransaction<
            Docs extends Record<string, SupportedDocument<Shape, Handle, Version>>,
        >(docs: Docs): Promise<{ tx: Transaction<Handle, Version>; draftDocs: Docs }> {
            const sources = Object.values(docs) as Array<SupportedDocument<Shape, Handle, Version>>;

            for (const doc of sources) {
                if (sources.some((other) => other !== doc && other.handle === doc.handle)) {
                    throw new Error("A document appears more than once in the transaction.");
                }
            }

            // Stage a draft of each document. Drafts are ordinary documents
            // as far as resolution is concerned: a draft's own ref resolves to
            // the draft, while a source's ref keeps resolving to the committed
            // document.
            const draftHandleBySource = new Map<Handle, Handle>();
            const draftHandleBySourceRefId = new Map<string, Handle>();
            for (const doc of sources) {
                const draftHandle = store.createDraft(doc.handle);
                draftHandleBySource.set(doc.handle, draftHandle);
                draftHandleBySourceRefId.set(store.getDocumentRef(doc.handle).id, draftHandle);
            }

            /** Construct the draft counterpart of a staged document. */
            async function draftDoc(
                doc: SupportedDocument<Shape, Handle, Version>,
            ): Promise<SupportedDocument<Shape, Handle, Version>> {
                const draftHandle = draftHandleBySource.get(doc.handle)!;
                switch (doc.document.type) {
                    case "model": {
                        return modelNotebookFromStore(doc.shape, store, draftHandle);
                    }
                    case "instance": {
                        // Connecting a draft instance to its schema is the
                        // binder's job: bind it to the schema's own draft when
                        // the schema is also staged in the transaction, and
                        // otherwise to the real schema resolved through the
                        // store.
                        const instanceOf = doc.document.instanceOf;
                        let schemaHandle = draftHandleBySourceRefId.get(instanceOf._id);
                        if (schemaHandle === undefined) {
                            const result = await store.getHandle({
                                id: instanceOf._id,
                                version: instanceOf._version,
                                server: instanceOf._server,
                            });
                            if (result.tag === "Err") {
                                throw new Error(
                                    `Cannot resolve the schema of instance "${doc.title}": ` +
                                        result.content.map((issue) => issue.message).join("\n"),
                                );
                            }
                            schemaHandle = result.content;
                        }
                        if (store.getDocumentView(schemaHandle).type !== "model") {
                            throw new Error(
                                `The schema of instance "${doc.title}" is not a model document.`,
                            );
                        }
                        const schema = modelNotebookFromStore(doc.shape, store, schemaHandle);
                        return instanceFromStore(doc.shape, schema, store, draftHandle);
                    }
                }
            }

            const drafts = new Map<
                SupportedDocument<Shape, Handle, Version>,
                SupportedDocument<Shape, Handle, Version>
            >();
            try {
                for (const doc of sources) {
                    drafts.set(doc, await draftDoc(doc));
                }
            } catch (error) {
                // Constructing the drafts failed: discard the staged drafts so
                // that they do not linger in the store.
                for (const draftHandle of draftHandleBySource.values()) {
                    store.discardDraft(draftHandle);
                }
                throw error;
            }

            const draftDocs = Object.fromEntries(
                Object.entries(docs).map(([key, doc]) => [key, drafts.get(doc)]),
            ) as Docs;

            const staged = sources.map((doc) => ({
                sourceHandle: doc.handle,
                draftHandle: draftHandleBySource.get(doc.handle)!,
            }));

            let state: "open" | "committed" | "aborted" = "open";
            const tx: Transaction<Handle, Version> = {
                commit(): Commit<Handle, Version> {
                    if (state !== "open") {
                        throw new Error(`The transaction has already been ${state}.`);
                    }
                    state = "committed";

                    const documents = new Map<Handle, DocumentChange<Version>>();
                    for (const { sourceHandle, draftHandle } of staged) {
                        documents.set(sourceHandle, store.commitDraft(sourceHandle, draftHandle));
                    }
                    return { documents };
                },
                abort(): void {
                    if (state !== "open") {
                        throw new Error(`The transaction has already been ${state}.`);
                    }
                    state = "aborted";
                    for (const { draftHandle } of staged) {
                        store.discardDraft(draftHandle);
                    }
                },
            };

            return { tx, draftDocs };
        },
    };
}
