import { isImmutableString } from "@automerge/automerge";

/** Recursively convert any automerge `ImmutableString` values to native strings. */
export function normalizeImmutableStrings<T>(value: T): T {
    if (isImmutableString(value)) {
        return value.toString() as unknown as T;
    }
    if (Array.isArray(value)) {
        return value.map(normalizeImmutableStrings) as unknown as T;
    }
    if (value !== null && typeof value === "object") {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = normalizeImmutableStrings(v);
        }
        return result as T;
    }
    return value;
}
