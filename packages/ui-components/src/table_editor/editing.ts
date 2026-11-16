import type { LiteralValue, Result, TableHeader } from "catcolab-documents";

export function isEditableCell(header: TableHeader): boolean {
    return header.type.tag !== "Unknown";
}

/** Parse text committed by a cell editor into a literal field value.

An empty field parses to `null`, clearing the cell. Row references are never
parsed here: they are committed through completions instead, so the read-only
draft text of a row-reference editor is always invalid.
 */
export function parseValue(header: TableHeader, text: string): Result<LiteralValue> {
    const trimmed = text.trim();
    if (trimmed === "") {
        return { tag: "Ok", content: null };
    }
    switch (header.type.tag) {
        case "String":
            return { tag: "Ok", content: text };
        case "Bool":
            return trimmed === "true" || trimmed === "false"
                ? { tag: "Ok", content: trimmed === "true" }
                : { tag: "Err", content: [{ message: "Expected a Bool literal" }] };
        case "Int":
        case "Float": {
            const value = Number(trimmed);
            const valid =
                header.type.tag === "Int" ? Number.isInteger(value) : Number.isFinite(value);
            return valid
                ? { tag: "Ok", content: value }
                : { tag: "Err", content: [{ message: `Invalid ${header.type.tag} literal` }] };
        }
        default:
            return { tag: "Err", content: [{ message: "Expected a literal column" }] };
    }
}

/** Whether a keystroke should start editing by replacing the cell content. */
export function isPrintableKey(evt: KeyboardEvent): boolean {
    return evt.key.length === 1 && !evt.ctrlKey && !evt.metaKey && !evt.altKey;
}
