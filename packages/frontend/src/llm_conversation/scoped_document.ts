import type { Document } from "catcolab-document-types";
import type { InstanceValidation, Issue, ModelValidation, Shape } from "catcolab-documents";

type DocumentValidation = ModelValidation<Shape> | InstanceValidation<Shape>;

/**
 * A draft document staged in the execution scope of an LLM conversation.
 */
export type DocumentDraft = {
    readonly document: Readonly<Document>;
    readonly title: string;
    validate(): Promise<DocumentValidation>;
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
};

/** Create the execution-scope representation of one staged draft document. */
export function createScopedDocument(options: {
    binding: DocumentDraft;
    role: ScopedDocumentRole;
    links?: ReadonlyArray<ScopedDocumentLink>;
    usedBindings: Set<string>;
}): ScopedDocument {
    const bindingName = uniqueBinding(options.binding.title, options.usedBindings);
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
    };
}

async function validateScopedDocument(
    document: DocumentDraft,
    binding: string,
): Promise<ReadonlyArray<string>> {
    const validation = await document.validate();
    const issues = validationIssues(validation);
    if (issues.length > 0) {
        return [`${binding}: ${JSON.stringify(issues)}`];
    }
    return [];
}

function validationIssues(validation: DocumentValidation): ReadonlyArray<Issue> {
    if ("modelValidation" in validation) {
        return [...validation.modelValidation.issues, ...validation.issues];
    }
    return validation.issues;
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
