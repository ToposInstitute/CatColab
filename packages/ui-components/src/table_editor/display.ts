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

/** Width of the single column shown when a table has no headers. */
export const EMPTY_COLUMN_WIDTH = 180;

/** The field of a row for a given header position. */
export function fieldOf(row: TableRow, columnIndex: number): FieldValue | undefined {
    return row.fields[columnIndex];
}

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
        const codomain = codomainOf(header, tables);
        const target = codomain?.rows.find((row) => row.id === field.content.id);
        return codomain && target ? defaultRowLabel(codomain, target) : "?";
    }
    if (field.tag === "Bool") {
        return field.content.value ? "true" : "false";
    }
    return String(field.content.value);
}

/** Default display label for a row referenced by a `RowRef` cell. */
export function defaultRowLabel(table: InstanceTable, row: TableRow): string {
    const tableName = tableDisplayName(table);
    if (table.headers.length === 0) {
        return `${tableName} row ${row.index + 1}`;
    }
    const first = row.fields[0];
    const value = first?.tag === "String" ? first.content.value : "";
    if (value === "") {
        return `${tableName} row ${row.index + 1}`;
    }
    return `${tableName} "${value}"`;
}

export function tableDisplayName(table: InstanceTable): string {
    return table.label === null ? "Unknown table" : table.label || "Unnamed table";
}
