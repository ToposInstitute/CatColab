import { cellTypesForTheory } from "catcolab-logics/cell-types";

import {
    type Binder,
    createBinder,
    type Instance,
    type LLMConversation,
    type LLMConversationAttachment,
    modelNotebookFromStore,
    type ModelDocument,
    type Notebook,
    type DocumentStore,
    type Shape,
    type Transaction,
} from "catcolab-documents";
import type { ContextExecScope } from "../inference/context_exec";
import { createScopedDocument, type ScopedDocument } from "./scoped_document";

const API_PROMPT = `The document bindings expose the CatColab document API. A notebook binding has \`title\`, \`cells()\`, \`cellsOf(type)\`, \`add(type, values)\`, \`update(patch)\`, and \`validate()\`; \`validate()\` returns the elaborated \`model\` and any \`issues\`. The \`type\` argument of a notebook's \`add\` method must be one of the cell-type bindings in scope; the \`values\` argument is an object: \`{ label }\` to add an object cell, \`{ label, from, to }\` to add a morphism cell (\`from\`/\`to\` are existing object cells), or \`{ content }\` to add an informal text cell. A tabular document binding has \`title\`, row editing methods, \`update(patch)\`, and \`validate()\`; \`validate()\` returns the \`tables\`, instance-data \`issues\`, the schema's \`modelValidation\`, and \`get(path)\`. These APIs mutate in-memory working copies; changes are applied to the user's documents only after every document validates without issues.`;

type SourceDocuments<Handle, Version> =
    | {
          tag: "SingleDocument";
          attachment: Notebook<Shape, ModelDocument, Handle, Version>;
      }
    | {
          tag: "DocumentWithParent";
          attachment: Instance<Handle, Shape, Version>;
          parent: Notebook<Shape, ModelDocument, Handle, Version>;
      };

export type LLMConversationExecutionScope = {
    bindings: ContextExecScope;
    systemPromptSuffix: string;
    validate(): Promise<ReadonlyArray<string>>;
    commit(): void;
    abort(): void;
};

export async function createLLMConversationExecutionScope<
    Handle,
    Version,
    Attachment extends LLMConversationAttachment<Shape, Handle, Version>,
>(
    conversation: LLMConversation<Attachment, Handle>,
    store: DocumentStore<Handle, Version>,
): Promise<LLMConversationExecutionScope> {
    const binder = createBinder(store);
    const { documents, theory, tx } = await createScopedDocuments(conversation.attachment, binder);
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
            void tx.commit();
        },
        abort() {
            tx.abort();
        },
    };
}

async function createScopedDocuments<Handle, Version>(
    attachment: LLMConversationAttachment<Shape, Handle, Version>,
    binder: Binder<Handle, Version>,
): Promise<{
    documents: ReadonlyArray<ScopedDocument>;
    theory?: string;
    tx: Transaction<Handle, Version>;
}> {
    const sources = await resolveSourceDocuments(attachment, binder.store);
    const sourceNotebook = sources.tag === "SingleDocument" ? sources.attachment : sources.parent;
    if (!sourceNotebook.shape.theory) {
        throw new Error("The document shape does not identify its theory.");
    }

    const shape = sourceNotebook.shape as Shape & { readonly theory: string };
    const usedBindings = new Set<string>();

    if (sources.tag === "SingleDocument") {
        const { tx, draftDocs } = await binder.beginTransaction({
            document: sources.attachment,
        });
        const attachedDocument = createScopedDocument({
            binding: draftDocs.document,
            role: "attachment",
            usedBindings,
        });
        return { documents: [attachedDocument], theory: shape.theory, tx };
    }

    const { tx, draftDocs } = await binder.beginTransaction({
        parent: sources.parent,
        attachment: sources.attachment,
    });
    const parentDocument = createScopedDocument({
        binding: draftDocs.parent,
        role: "linked",
        usedBindings,
    });
    const attachedDocument = createScopedDocument({
        binding: draftDocs.attachment,
        role: "attachment",
        links: [{ name: "instanceOf", targetBinding: parentDocument.binding }],
        usedBindings,
    });
    return {
        documents: [attachedDocument, parentDocument],
        theory: shape.theory,
        tx,
    };
}

async function resolveSourceDocuments<Handle, Version>(
    attachment: LLMConversationAttachment<Shape, Handle, Version>,
    store: DocumentStore<Handle, Version>,
): Promise<SourceDocuments<Handle, Version>> {
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

function isNotebook<Handle, Version>(
    document: LLMConversationAttachment<Shape, Handle, Version>,
): document is Notebook<Shape, ModelDocument, Handle, Version> {
    return document.document.type === "model";
}

async function resolveHandle<Handle, Version>(
    store: DocumentStore<Handle, Version>,
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
