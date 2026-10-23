import type { Issue } from "../result";
import type { DeepReadonly } from "../util/deep-readonly";
declare const structurallyValid: unique symbol;

/** Containers and ordering are normalized. Metadata and payloads are not validated. */
export type StructurallyValid<T> = DeepReadonly<T> & { readonly [structurallyValid]: true };
export interface StructuralIssue extends Issue {
    readonly path: readonly string[];
}
export interface WithIssues<T> {
    readonly value: T;
    readonly issues: readonly StructuralIssue[];
}
type RecordValue = Record<string, unknown>;

export function isRecord(value: unknown): value is RecordValue {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function record(value: unknown, path: string[], issues: StructuralIssue[]): RecordValue {
    if (isRecord(value)) {
        return value;
    }
    issues.push({ message: "Expected an object", path });
    return {};
}

export function order(
    value: unknown,
    contents: RecordValue,
    path: string[],
    issues: StructuralIssue[],
): string[] {
    const ids = Array.isArray(value) ? value : [];
    const retained = [
        ...new Set(
            ids.filter((id): id is string => typeof id === "string" && Object.hasOwn(contents, id)),
        ),
    ];
    const seen = new Set(retained);
    const missing = Object.keys(contents).filter((id) => !seen.has(id));
    if (!Array.isArray(value) || retained.length !== ids.length || missing.length) {
        issues.push({ message: "Order must list each stored entry exactly once", path });
    }
    return [...retained, ...missing];
}
