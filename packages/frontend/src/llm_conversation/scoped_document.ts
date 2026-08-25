import type { Document } from "catcolab-document-types";
import {
    type DocumentStore,
    type LLMConversationAttachment,
    type ModelDocument,
    type Notebook,
    type Shape,
} from "catcolab-documents";
import { createDocumentTransaction } from "./document_transaction";

export type ScopedDocumentLink = {
    name: string;
    targetBinding: string;
};

type ScopedDocumentDescription = {
    binding: string;
    title: string;
    isAttachment: boolean;
    links?: ReadonlyArray<ScopedDocumentLink>;
};

export type ScopedDocument = {
    binding: string;
    value: unknown;
    isAttachment: boolean;
    description: string;
    validate(): Promise<ReadonlyArray<string>>;
    commit(): void;
};

/** Create and stage the execution-scope representation of one document. */
export function createScopedDocument<Handle, S extends Shape>(options: {
    binding: LLMConversationAttachment<S, Document>;
    bindingStore: DocumentStore<Document>;
    sourceHandle: Handle;
    sourceStore: DocumentStore<Handle>;
    isAttachment: boolean;
    links?: ReadonlyArray<ScopedDocumentLink>;
    preservedKeys?: ReadonlyArray<string>;
    usedBindings: Set<string>;
}): ScopedDocument {
    const bindingName = uniqueBinding(options.binding.title, options.usedBindings);
    const transaction = createDocumentTransaction({
        copyStore: options.bindingStore,
        copyHandle: options.binding.handle,
        commitStore: options.sourceStore,
        commitHandle: options.sourceHandle,
        preservedKeys: options.preservedKeys,
    });
    transaction.stage();

    return {
        binding: bindingName,
        value: options.binding,
        isAttachment: options.isAttachment,
        description: describeScopedDocument({
            binding: bindingName,
            title: options.binding.title,
            isAttachment: options.isAttachment,
            links: options.links,
        }),
        validate: () => validateScopedDocument(options.binding, bindingName),
        commit: () => transaction.commit(),
    };
}

export function isNotebookDocument<S extends Shape, Handle>(
    document: LLMConversationAttachment<S, Handle>,
): document is Notebook<S, ModelDocument, Handle> {
    return document.document.type === "model";
}

export function formatDocumentIssues(
    issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<unknown> }>,
): string[] {
    return issues.map((issue) => {
        if (!issue.path?.length) {
            return issue.message;
        }
        const path = issue.path
            .map((segment) =>
                typeof segment === "object" && segment !== null && "key" in segment
                    ? String(segment.key)
                    : String(segment),
            )
            .join(".");
        return `${issue.message} (at ${path})`;
    });
}

async function validateScopedDocument<S extends Shape>(
    document: LLMConversationAttachment<S, Document>,
    binding: string,
): Promise<ReadonlyArray<string>> {
    if (isNotebookDocument(document)) {
        const result = await document.validate();
        if (result.tag === "Err") {
            return formatDocumentIssues(result.content).map((issue) => `${binding}: ${issue}`);
        }
        result.content.free();
        return [];
    }

    const result = await document.validate();
    return result.tag === "Err"
        ? formatDocumentIssues(result.content).map((issue) => `${binding}: ${issue}`)
        : [];
}

function describeScopedDocument(description: ScopedDocumentDescription): string {
    const kind = description.isAttachment ? "attached document" : "document";
    const links = (description.links ?? [])
        .map((link) => ` Its \`${link.name}\` link points to \`${link.targetBinding}\`.`)
        .join("");
    return `\`${description.binding}\` is the ${kind} ${JSON.stringify(description.title)}.${links}`;
}

function uniqueBinding(title: string, used: Set<string>): string {
    const stem = title
        .normalize("NFKD")
        .replace(/[^A-Za-z0-9_$]+/g, "_")
        .replace(/^_+|_+$/g, "");
    const base = `document_${stem || "untitled"}`;
    let binding = base;
    for (let suffix = 2; used.has(binding); suffix += 1) {
        binding = `${base}_${suffix}`;
    }
    used.add(binding);
    return binding;
}
