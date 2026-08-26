/* This code is expected to be replaced by catlog implementations in the future once a commitment to the mathematical account of instances has been made. */

import type { InstanceDocument } from "catcolab-document-methods";
import type * as DocumentTypes from "catcolab-document-types";
import type { QualifiedLabel } from "catlog-wasm";
import type { FieldPath, TableFieldIssue } from "./errors";
import type { InstanceTable, LiteralType, TableHeader } from "./tables";

/** Decide which concrete atomic type an attribute type's qualified label
    denotes. The first label segment decides. This function is intended to be
    temporary and should be replaced once we have an account of typing with
    which we are satisfied. */
export function atomicTypeOfAttributeType(label: QualifiedLabel): LiteralType {
    const name = label[0];
    switch (name) {
        case "Bool":
        case "Int":
        case "Float":
        case "String":
            return name;
        default:
            return "String";
    }
}

/** Compare stored fields with tables derived from a validated schema model. */
export function validateTableFields(
    document: Readonly<InstanceDocument>,
    tables: ReadonlyArray<InstanceTable>,
): TableFieldIssue[] {
    const tableById = new Map(tables.map((table) => [table.id, table]));
    const rowTables = new Map<string, Set<string>>();

    for (const [tableId, table] of Object.entries(document.tables)) {
        for (const rowId of Object.keys(table.rows)) {
            const tables = rowTables.get(rowId) ?? new Set<string>();
            tables.add(tableId);
            rowTables.set(rowId, tables);
        }
    }

    const issues: TableFieldIssue[] = [];
    for (const [tableId, storedTable] of Object.entries(document.tables)) {
        const table = tableById.get(tableId);
        if (table === undefined) {
            continue;
        }
        const headerById = new Map(table.headers.map((header) => [header.id, header]));
        for (const [rowId, row] of Object.entries(storedTable.rows)) {
            for (const header of table.headers) {
                const fieldId = header.id;
                const path = fieldPath(tableId, rowId, fieldId);
                const value = row.fields[fieldId] ?? "Null";
                if (value === "Null") {
                    issues.push({
                        message: `\`${header.label}\` in table \`${table.label}\` is missing a value`,
                        path,
                        issueType: "MissingValue",
                    });
                    continue;
                }
                if (header.type.tag === "RowRef") {
                    if (!isStoredRowRef(value)) {
                        issues.push(mistypedLiteralIssue(table, header, path));
                        continue;
                    }
                    const containingTables = rowTables.get(value.RowRef);
                    if (containingTables === undefined) {
                        issues.push({
                            message: `\`${header.label}\` refers to a row that no longer exists`,
                            path,
                            issueType: "DanglingRowRef",
                        });
                    } else if (!containingTables.has(header.type.content.id)) {
                        const actualTableId = containingTables.values().next().value as
                            | string
                            | undefined;
                        let actualLabel = "";
                        if (actualTableId !== undefined) {
                            actualLabel = tableById.get(actualTableId)?.label ?? actualTableId;
                        }
                        const targetLabel =
                            tableById.get(header.type.content.id)?.label ?? header.type.content.id;
                        issues.push({
                            message: `\`${header.label}\` must be a row of table \`${targetLabel}\` (was a row of table \`${actualLabel}\`)`,
                            path,
                            issueType: "MistypedRowRef",
                        });
                    }
                } else if (!storedValueMatchesLiteralType(value, header.type.tag)) {
                    issues.push(mistypedLiteralIssue(table, header, path));
                }
            }
            for (const fieldId of Object.keys(row.fields)) {
                if (headerById.has(fieldId)) {
                    continue;
                }
                issues.push({
                    message: `Field \`${fieldId}\` is not a typed column of table \`${table.label}\``,
                    path: fieldPath(tableId, rowId, fieldId),
                    issueType: "MistypedLiteral",
                });
            }
        }
    }
    return issues;
}

function fieldPath(tableId: string, rowId: string, fieldId: string): FieldPath {
    return [tableId, "rows", rowId, "fields", fieldId];
}

function isStoredRowRef(value: DocumentTypes.FieldValue): value is { RowRef: string } {
    return value !== "Null" && "RowRef" in value;
}

function storedValueMatchesLiteralType(
    value: Exclude<DocumentTypes.FieldValue, "Null">,
    type: LiteralType,
): boolean {
    switch (type) {
        case "Bool":
            return "Bool" in value && typeof value.Bool === "boolean";
        case "Int":
            return "Int" in value && Number.isInteger(value.Int);
        case "Float":
            return "Float" in value && Number.isFinite(value.Float);
        case "String":
            return "String" in value && typeof value.String === "string";
    }
}

function mistypedLiteralIssue(
    table: InstanceTable,
    header: TableHeader,
    path: FieldPath,
): TableFieldIssue {
    return {
        message: `\`${header.label}\` in table \`${table.label}\` does not have type ${header.type.tag}`,
        path,
        issueType: "MistypedLiteral",
    };
}
