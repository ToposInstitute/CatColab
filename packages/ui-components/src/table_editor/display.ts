import type { FieldValue, InstanceTable, TableHeader, TableRow } from "catcolab-documents";

/** Column widths in pixels, by header type. */
export const COLUMN_WIDTHS = {
    Bool: 80,
    Int: 100,
    Float: 100,
    String: 180,
    RowRef: 220,
    Unknown: 220,
} as const;

/** Width of the column holding the row deletion buttons. */
export const DELETE_COLUMN_WIDTH = 36;

/** The table referenced by a `RowRef` column, if it can be resolved. */
export function codomainOf(
    header: TableHeader,
    tables: ReadonlyArray<InstanceTable>,
): InstanceTable | undefined {
    const type = header.type;
    if (type.tag !== "RowRef") {
        return undefined;
    }
    return tables.find((table) => table.id === type.content.id);
}

/** Display text for a cell's field value. */
export function fieldText(
    field: FieldValue | undefined,
    header: TableHeader,
    tables: ReadonlyArray<InstanceTable>,
): string {
    if (!field || field.tag === "Null") {
        return "";
    }
    if (field.tag === "RowRef") {
        return rowRefText(field.content.id, header, tables);
    }
    if (field.tag === "Bool") {
        return field.content.value ? "true" : "false";
    }
    return String(field.content.value);
}

/** Display text for a row reference.

A reference into the column's codomain displays the target row's label. A
reference to a row of some other table displays that row's label, exposing a
type error to the user. A reference to no row at all displays the codomain's
name followed by a question mark.
 */
function rowRefText(
    rowId: string,
    header: TableHeader,
    tables: ReadonlyArray<InstanceTable>,
): string {
    const codomain = codomainOf(header, tables);
    const target = codomain?.rows.find((row) => row.id === rowId);
    if (codomain && target) {
        return rowDisplayLabel(target);
    }
    for (const table of tables) {
        const mistyped = table.rows.find((row) => row.id === rowId);
        if (mistyped) {
            return rowDisplayLabel(mistyped);
        }
    }
    return codomain ? `${tableDisplayName(codomain)} ?` : "?";
}

export function rowDisplayLabel(row: TableRow): string {
    return row.label || String(row.index + 1);
}

export function tableDisplayName(table: InstanceTable): string {
    return table.label === null ? "Unknown table" : table.label || "Unnamed table";
}
