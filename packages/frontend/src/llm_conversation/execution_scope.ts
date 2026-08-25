import {
    createBinder,
    type Instance,
    type LLMConversation,
    type LLMConversationAttachment,
    modelNotebookFromStore,
    type ModelDocument,
    type Notebook,
    type DocumentStore,
    type Shape,
} from "catcolab-documents";
import type { ContextExecScope } from "../inference/context_exec";
import {
    createScopedDocument,
    formatDocumentIssues,
    isNotebookDocument,
    type ScopedDocument,
} from "./scoped_document";

const API_PROMPT = `The document bindings expose the CatColab document API. A notebook binding has \`title\`, \`cells()\`, \`cellsOf(type)\`, \`add(type, values)\`, \`update(patch)\`, and \`validate()\`. A tabular document binding has \`title\`, \`tables()\`, \`get(path)\`, row editing methods, \`update(patch)\`, and \`validate()\`. These APIs mutate in-memory working copies; changes are applied to the user's documents only after every document validates.`;

type SourceDocuments<Handle> =
    | {
          tag: "SingleDocument";
          attachment: Notebook<Shape, ModelDocument, Handle>;
      }
    | {
          tag: "DocumentWithParent";
          attachment: Instance<Handle, Shape>;
          parent: Notebook<Shape, ModelDocument, Handle>;
      };

export type LLMConversationExecutionScope = {
    bindings: ContextExecScope;
    systemPromptSuffix: string;
    validate(): Promise<ReadonlyArray<string>>;
    commit(): void;
};

export async function createLLMConversationExecutionScope<
    Handle,
    Attachment extends LLMConversationAttachment<Shape, Handle>,
>(
    conversation: LLMConversation<Attachment, Handle>,
    store: DocumentStore<Handle>,
): Promise<LLMConversationExecutionScope> {
    const documents = await createScopedDocuments(conversation.attachment, store);
    const descriptions = [
        ...documents.filter((document) => document.isAttachment),
        ...documents.filter((document) => !document.isAttachment),
    ].map((document) => document.description);

    return {
        bindings: Object.freeze(
            Object.fromEntries(documents.map(({ binding, value }) => [binding, value])),
        ),
        systemPromptSuffix: `${API_PROMPT}\n\nThe following documents are in scope:\n${descriptions.join("\n")}`,
        async validate() {
            const problems: string[] = [];
            for (const document of documents) {
                problems.push(...(await document.validate()));
            }
            return problems;
        },
        commit() {
            for (const document of documents) {
                document.commit();
            }
        },
    };
}

async function createScopedDocuments<Handle>(
    attachment: LLMConversationAttachment<Shape, Handle>,
    store: DocumentStore<Handle>,
): Promise<ReadonlyArray<ScopedDocument>> {
    const sources = await resolveSourceDocuments(attachment, store);
    const sourceNotebook = sources.tag === "SingleDocument" ? sources.attachment : sources.parent;
    if (!sourceNotebook.shape.theory) {
        throw new Error("The document shape does not identify its theory.");
    }

    const shape = sourceNotebook.shape as Shape & { readonly theory: string };
    const copyBinder = createBinder();
    const copyNotebook = await copyBinder.createNotebook(shape, {
        title: sourceNotebook.title,
    });
    const usedBindings = new Set<string>();
    const scopeNotebook = (isAttachment: boolean) =>
        createScopedDocument({
            binding: copyNotebook,
            bindingStore: copyBinder.store,
            sourceHandle: sourceNotebook.handle,
            sourceStore: store,
            isAttachment,
            usedBindings,
        });

    if (sources.tag === "SingleDocument") {
        return [scopeNotebook(true)];
    }

    const created = await copyBinder.createInstance(copyNotebook, {
        title: sources.attachment.title,
    });
    if (created.tag === "Err") {
        throw new Error(formatDocumentIssues(created.content).join("\n"));
    }
    const parentDocument = scopeNotebook(false);
    const attachedDocument = createScopedDocument({
        binding: created.content,
        bindingStore: copyBinder.store,
        sourceHandle: sources.attachment.handle,
        sourceStore: store,
        isAttachment: true,
        links: [{ name: "instanceOf", targetBinding: parentDocument.binding }],
        preservedKeys: ["instanceOf"],
        usedBindings,
    });
    return [parentDocument, attachedDocument];
}

async function resolveSourceDocuments<Handle>(
    attachment: LLMConversationAttachment<Shape, Handle>,
    store: DocumentStore<Handle>,
): Promise<SourceDocuments<Handle>> {
    if (isNotebookDocument(attachment)) {
        return { tag: "SingleDocument", attachment };
    }

    const parentHandle = await resolveHandle(store, attachment.document.instanceOf);
    const parentDocument = store.getDocumentView(parentHandle);
    if (parentDocument.type !== "model") {
        throw new Error("The document linked by instanceOf is not a model document.");
    }
    return {
        tag: "DocumentWithParent",
        attachment,
        parent: modelNotebookFromStore(attachment.shape, store, parentHandle),
    };
}

async function resolveHandle<Handle>(
    store: DocumentStore<Handle>,
    ref: { _id: string; _version: string | null; _server: string },
): Promise<Handle> {
    const result = await store.getHandle({
        id: ref._id,
        version: ref._version,
        server: ref._server,
    });
    if (result.tag === "Err") {
        throw new Error(formatDocumentIssues(result.content).join("\n"));
    }
    return result.content;
}
