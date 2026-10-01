import {
    Instance as InstanceMethods,
    LLMConversation as LLMConversationMethods,
    Model,
} from "catcolab-document-methods";
import type { Document } from "catcolab-document-types";
import type { DocumentRef, DocumentStore, HandlesByLinkType } from "./document-store";
import { createInMemoryStore, validateInstanceDocumentStructure } from "./document-store";
import type { DocumentChange } from "./document-store";
import { instanceFromStore, type Instance } from "./instance/instance";
import { type LLMConversation, llmConversationFromStore } from "./llm-conversation";
import type { ModelDocument } from "./model/document";
import { modelNotebookFromStore, type Notebook } from "./model/notebook";
import type { Result } from "./result";
import type { Shape } from "./shape";
import type { SupportedDocument } from "./supported-document";
import type { Commit, Transaction } from "./transaction";

export interface Binder<Handle, Version> {
    getHandle(ref: DocumentRef): Promise<Result<Handle>>;
    getDocumentRef(handle: Handle): DocumentRef;
    listUsedBy(handle: Handle): Promise<HandlesByLinkType<Handle>>;
    listDependsOn(handle: Handle): Promise<HandlesByLinkType<Handle>>;

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

    createLLMConversation<Attachment extends SupportedDocument<Shape, Handle, Version>>(
        attachment: Attachment,
        llmModel: string,
        options: { title: string },
    ): Promise<LLMConversation<Attachment, Handle>>;

    loadLLMConversationFromRef<Attachment extends SupportedDocument<Shape, Handle, Version>>(
        attachment: Attachment,
        ref: DocumentRef,
    ): Promise<Result<LLMConversation<Attachment, Handle>>>;

    loadInstanceFromRef<S extends Shape>(
        schema: Notebook<S, ModelDocument, Handle, Version>,
        ref: DocumentRef,
    ): Promise<Result<Instance<Handle, S, Version>>>;

    /** Load the supported document at a ref. Model notebooks are loaded with
     * the given candidate shapes, matched by theory. */
    loadSupportedDocumentFromRef(
        shapes: ReadonlyArray<Shape & { readonly theory: string }>,
        ref: DocumentRef,
    ): Promise<Result<SupportedDocument<Shape, Handle, Version>>>;

    /** Load a document dump into the store as a supported document. Model
     * notebooks are loaded with the given candidate shapes, matched by theory. */
    loadSupportedDocument(
        shapes: ReadonlyArray<Shape & { readonly theory: string }>,
        document: Document,
    ): Promise<Result<SupportedDocument<Shape, Handle, Version>>>;

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
    async function loadSupportedDocumentFromRef(
        shapes: ReadonlyArray<Shape & { readonly theory: string }>,
        ref: DocumentRef,
    ): Promise<Result<SupportedDocument<Shape, Handle, Version>>> {
        const result = await store.getHandle(ref);
        if (result.tag === "Err") {
            return result;
        }
        const handle = result.content;
        const document = store.getDocumentView(handle);
        switch (document.type) {
            case "model": {
                const shape = shapes.find((candidate) => candidate.theory === document.theory);
                if (shape === undefined) {
                    return {
                        tag: "Err",
                        content: [
                            {
                                message: `No shape is available for theory "${document.theory}".`,
                                path: ["theory"],
                            },
                        ],
                    };
                }
                return binder.loadNotebookFromRef(shape, ref);
            }
            case "instance": {
                const schemaResult = await loadSupportedDocumentFromRef(shapes, {
                    id: document.instanceOf._id,
                    version: document.instanceOf._version,
                    server: document.instanceOf._server,
                });
                if (schemaResult.tag === "Err") {
                    return schemaResult;
                }
                const schema = schemaResult.content;
                if (schema.type !== "model") {
                    return {
                        tag: "Err",
                        content: [
                            {
                                message: `The schema of an instance must be a model document, not "${schema.type}".`,
                                path: ["instanceOf"],
                            },
                        ],
                    };
                }
                return binder.loadInstanceFromRef(schema, ref);
            }
            case "llmconversation": {
                const attachmentResult = await loadSupportedDocumentFromRef(shapes, {
                    id: document.llmConversationOf._id,
                    version: document.llmConversationOf._version,
                    server: document.llmConversationOf._server,
                });
                if (attachmentResult.tag === "Err") {
                    return attachmentResult;
                }
                return binder.loadLLMConversationFromRef(attachmentResult.content, ref);
            }
            default:
                return {
                    tag: "Err",
                    content: [
                        {
                            message: `Cannot load a document of type "${document.type}".`,
                            path: ["type"],
                        },
                    ],
                };
        }
    }

    const binder: Binder<Handle, Version> = {
        getHandle: (ref) => store.getHandle(ref),
        getDocumentRef: (handle) => store.getDocumentRef(handle),
        listUsedBy: (handle) => store.listUsedBy(handle),
        listDependsOn: (handle) => store.listDependsOn(handle),
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
                content: instanceFromStore(schema, store, handle),
            };
        },
        async createLLMConversation<Attachment extends SupportedDocument<Shape, Handle, Version>>(
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
        async loadLLMConversationFromRef<
            Attachment extends SupportedDocument<Shape, Handle, Version>,
        >(attachment: Attachment, ref: DocumentRef) {
            const result = await store.getHandle(ref);
            if (result.tag === "Err") {
                return result;
            }
            const document = store.getDocumentView(result.content);
            if (document.type !== "llmconversation") {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: `Cannot load document of type "${document.type}" as an LLM conversation.`,
                            path: ["type"],
                        },
                    ],
                };
            }
            const attachmentRef = store.getDocumentRef(attachment.handle);
            if (
                document.llmConversationOf._id !== attachmentRef.id ||
                document.llmConversationOf._version !== attachmentRef.version ||
                document.llmConversationOf._server !== (attachmentRef.server ?? "")
            ) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: `Cannot load conversation attached to "${document.llmConversationOf._id}" using attachment "${attachmentRef.id}".`,
                            path: ["llmConversationOf"],
                        },
                    ],
                };
            }
            return {
                tag: "Ok",
                content: llmConversationFromStore(store, result.content, attachment),
            };
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

            const structuralIssues = validateInstanceDocumentStructure(document);
            if (structuralIssues.length > 0) {
                return { tag: "Err" as const, content: structuralIssues };
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
                content: instanceFromStore(schema, store, result.content),
            };
        },
        loadSupportedDocumentFromRef,
        async loadSupportedDocument(
            shapes: ReadonlyArray<Shape & { readonly theory: string }>,
            document: Document,
        ): Promise<Result<SupportedDocument<Shape, Handle, Version>>> {
            const handle = await store.createHandle(document);
            return loadSupportedDocumentFromRef(shapes, store.getDocumentRef(handle));
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

            const drafts = new Map<Handle, SupportedDocument<Shape, Handle, Version>>();

            /** Construct the draft counterpart of a staged document, or
             * undefined when it cannot be drafted yet because it binds to the
             * draft of another staged document that has not been drafted. */
            async function draftDoc(
                doc: SupportedDocument<Shape, Handle, Version>,
            ): Promise<SupportedDocument<Shape, Handle, Version> | undefined> {
                const draftHandle = draftHandleBySource.get(doc.handle)!;
                switch (doc.type) {
                    case "model": {
                        return modelNotebookFromStore(doc.shape, store, draftHandle);
                    }
                    case "instance": {
                        //  bind it to the schema's own draft when the schema is
                        // also staged in the transaction, and otherwise to the
                        // real schema resolved through the store.
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
                        return instanceFromStore(schema, store, draftHandle);
                    }
                    case "llmconversation": {
                        // binds to the draft of the document it is attached to
                        // when that document is also staged in the transaction,
                        // and otherwise to the real document.
                        const attachment = doc.attachment;
                        if (draftHandleBySource.has(attachment.handle)) {
                            const attachmentDraft = drafts.get(attachment.handle);
                            if (attachmentDraft === undefined) {
                                return undefined;
                            }
                            return llmConversationFromStore(store, draftHandle, attachmentDraft);
                        }
                        return llmConversationFromStore(store, draftHandle, attachment);
                    }
                }
            }

            // Draft the staged documents in dependency order
            const pending = [...sources];
            try {
                while (pending.length > 0) {
                    const drafted = await Promise.all(pending.map((doc) => draftDoc(doc)));
                    const remaining = pending.filter((_, index) => drafted[index] === undefined);
                    if (remaining.length === pending.length) {
                        throw new Error(
                            "The staged conversations are attached in a cycle, " +
                                "so no draft order exists.",
                        );
                    }
                    for (const [index, doc] of pending.entries()) {
                        const draft = drafted[index];
                        if (draft !== undefined) {
                            drafts.set(doc.handle, draft);
                        }
                    }
                    pending.splice(0, pending.length, ...remaining);
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
                Object.entries(docs).map(([key, doc]) => [key, drafts.get(doc.handle)]),
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
    return binder;
}
