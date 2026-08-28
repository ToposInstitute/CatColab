import type { Document } from "catcolab-document-types";
import { type DocumentStore, type Issue, type Result } from "catcolab-documents";
import { createDocumentTransaction } from "./document_transaction";

export type DocumentBinding<Handle = unknown, E extends Issue = Issue> = {
    readonly document: Readonly<Document>;
    readonly handle: Handle;
    readonly title: string;
    validate(): Promise<Result<unknown, ReadonlyArray<E>> | { issues: ReadonlyArray<E> }>;
};

export type ScopedDocumentLink = {
    name: string;
    targetBinding: string;
};

export type ScopedDocumentRole = "attachment" | "linked";

type ScopedDocumentDescription = {
    binding: string;
    title: string;
    role: ScopedDocumentRole;
    links?: ReadonlyArray<ScopedDocumentLink>;
};

export type ScopedDocument = {
    binding: string;
    value: unknown;
    description: string;
    validate(): Promise<ReadonlyArray<string>>;
    commit(): void;
};

/** Create and stage the execution-scope representation of one document. */
export function createScopedDocument<Handle, E extends Issue>(options: {
    binding: DocumentBinding<Document, E>;
    bindingStore: DocumentStore<Document>;
    sourceHandle: Handle;
    sourceStore: DocumentStore<Handle>;
    role: ScopedDocumentRole;
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
        description: describeScopedDocument({
            binding: bindingName,
            title: options.binding.title,
            role: options.role,
            links: options.links,
        }),
        validate: () => validateScopedDocument(options.binding, bindingName),
        commit: () => transaction.commit(),
    };
}

async function validateScopedDocument<E extends Issue>(
    document: DocumentBinding<Document, E>,
    binding: string,
): Promise<ReadonlyArray<string>> {
    const result = await document.validate();
    const issues = "issues" in result ? result.issues : result.tag === "Err" ? result.content : [];
    if (issues.length > 0) {
        return [`${binding}: ${JSON.stringify(issues)}`];
    }
    return [];
}

function describeScopedDocument(description: ScopedDocumentDescription): string {
    const kind = description.role === "attachment" ? "attached document" : "document";
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
