import { cellTypesForTheory } from "catcolab-logics/cell-types";

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
    type ScopedDocument,
    type ScopedDocumentRole,
} from "./scoped_document";

const API_PROMPT = `The document bindings expose the CatColab document API. A notebook binding has \`title\`, \`cells()\`, \`cellsOf(type)\`, \`add(type, values)\`, \`update(patch)\`, and \`validate()\`; \`validate()\` returns the elaborated \`model\` and any \`issues\`. The \`type\` argument of a notebook's \`add\` method must be one of the cell-type bindings in scope; the \`values\` argument is an object: \`{ label }\` to add an object cell, \`{ label, from, to }\` to add a morphism cell (\`from\`/\`to\` are existing object cells), or \`{ content }\` to add an informal text cell. A tabular document binding has \`title\`, row editing methods, \`update(patch)\`, and \`validate()\`; \`validate()\` returns the \`tables\`, instance-data \`issues\`, the schema's \`modelValidation\`, and \`get(path)\`. These APIs mutate in-memory working copies; changes are applied to the user's documents only after every document validates without issues.`;

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
    const { documents, theory } = await createScopedDocuments(conversation.attachment, store);
    const descriptions = documents.map((document) => document.description);
    const cellTypes = cellTypesForTheory(theory);
    const vocabularyDescription = cellTypes
        ? `The cell types of the notebook documents, for use with their \`add\` method, are: ${Object.keys(
              cellTypes,
          )
              .map((name) => `\`${name}\``)
              .join(", ")}.`
        : undefined;

    return {
        bindings: Object.freeze({
            ...Object.fromEntries(documents.map(({ binding, value }) => [binding, value])),
            ...cellTypes,
        }),
        systemPromptSuffix: [
            API_PROMPT,
            `The following documents are in scope:\n${descriptions.join("\n")}`,
            vocabularyDescription,
        ]
            .filter((part) => part !== undefined)
            .join("\n\n"),
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
): Promise<{ documents: ReadonlyArray<ScopedDocument>; theory?: string }> {
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
    const scopeNotebook = (role: ScopedDocumentRole) =>
        createScopedDocument({
            binding: copyNotebook,
            bindingStore: copyBinder.store,
            sourceHandle: sourceNotebook.handle,
            sourceStore: store,
            role,
            usedBindings,
        });

    if (sources.tag === "SingleDocument") {
        return { documents: [scopeNotebook("attachment")], theory: shape.theory };
    }

    const created = await copyBinder.createInstance(copyNotebook, {
        title: sources.attachment.title,
    });
    if (created.tag === "Err") {
        throw new Error(JSON.stringify(created.content));
    }
    const parentDocument = scopeNotebook("linked");
    const attachedDocument = createScopedDocument({
        binding: created.content,
        bindingStore: copyBinder.store,
        sourceHandle: sources.attachment.handle,
        sourceStore: store,
        role: "attachment",
        links: [{ name: "instanceOf", targetBinding: parentDocument.binding }],
        preservedKeys: ["instanceOf"],
        usedBindings,
    });
    return {
        documents: [attachedDocument, parentDocument],
        theory: shape.theory,
    };
}

async function resolveSourceDocuments<Handle>(
    attachment: LLMConversationAttachment<Shape, Handle>,
    store: DocumentStore<Handle>,
): Promise<SourceDocuments<Handle>> {
    if (isNotebook(attachment)) {
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

function isNotebook<Handle>(
    document: LLMConversationAttachment<Shape, Handle>,
): document is Notebook<Shape, ModelDocument, Handle> {
    return document.document.type === "model";
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
        throw new Error(JSON.stringify(result.content));
    }
    return result.content;
}
