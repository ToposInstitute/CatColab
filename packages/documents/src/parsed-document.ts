import type { Issue } from "./result";

/** An issue reported while parsing; its path is always present. */
export interface StructuralIssue extends Issue {
    readonly path: ReadonlyArray<PropertyKey>;
}

/** A parsed value together with the issues repaired while parsing it. */
export interface WithIssues<T> {
    readonly value: T;
    readonly issues: ReadonlyArray<StructuralIssue>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function structuralIssue(
    message: string,
    path: ReadonlyArray<PropertyKey>,
): StructuralIssue {
    return { message, path };
}
