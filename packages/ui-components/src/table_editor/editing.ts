import type { LiteralValue, TableHeader } from "catcolab-documents";

export function isEditableCell(header: TableHeader): boolean {
    return header.type.tag !== "Unknown";
}

/** Parse text committed by a cell editor into a literal field value.

An empty field parses to `null`, clearing the cell. Row references are never
parsed here: they are committed through completions instead, so the read-only
draft text of a row-reference editor is always invalid.
 */
export function parseValue(
    header: TableHeader,
    text: string,
): { ok: true; value: LiteralValue } | { ok: false } {
    const trimmed = text.trim();
    if (trimmed === "") {
        return { ok: true, value: null };
    }
    switch (header.type.tag) {
        case "String":
            // Interior spaces are significant, so the text is kept as is.
            return { ok: true, value: text };
        case "Int": {
            const parsed = Number(trimmed);
            return Number.isInteger(parsed) ? { ok: true, value: parsed } : { ok: false };
        }
        case "Float": {
            const parsed = Number(trimmed);
            return Number.isFinite(parsed) ? { ok: true, value: parsed } : { ok: false };
        }
        case "Bool":
            return trimmed === "true" || trimmed === "false"
                ? { ok: true, value: trimmed === "true" }
                : { ok: false };
        default:
            return { ok: false };
    }
}

/** Whether a keystroke should start editing by replacing the cell content. */
export function isPrintableKey(evt: KeyboardEvent): boolean {
    return evt.key.length === 1 && !evt.ctrlKey && !evt.metaKey && !evt.altKey;
}
