import type { Document } from "catcolab-document-types";
import type { InstanceValidation, Issue, ModelValidation, Shape } from "catcolab-documents";

type DocumentValidation = ModelValidation<Shape> | InstanceValidation<Shape>;

/**
 * A draft document staged in the execution scope of an LLM conversation.
 * Conversation drafts have nothing to validate, so they omit `validate`.
 */
export type DocumentDraft = {
    readonly document: Readonly<Document>;
    readonly title: string;
    validate?(): Promise<DocumentValidation>;
};

export type ScopedDocument = {
    binding: string;
    value: unknown;
    description: string;
    validate(): Promise<ReadonlyArray<string>>;
};

/** A binding name for a document, unique among the bindings already used. */
export function uniqueBinding(title: string, used: Set<string>): string {
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

/** Validate a staged draft, reporting its issues under its binding name. */
export async function validateDraft(
    document: DocumentDraft,
    binding: string,
): Promise<ReadonlyArray<string>> {
    if (document.validate === undefined) {
        return [];
    }
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
