import type { Document } from "catcolab-document-types";
import type { Issue } from "../result";

/* Structural validation of the underlying JSON of an instance document.

Checks that an instance document is well-formed enough for the operations in
this package to work without defensive per-access checks: the required
fields are present and stored tables have the expected shape. In particular,
the row order of every table must list exactly the rows of the table, each
once, so readers can use it without reconciling it against the rows.
Validation is deliberately tolerant of extra fields and of semantic problems
(those are the instance validator's job). */

type Path = ReadonlyArray<PropertyKey>;

/** An issue reported by structural validation; its path is always present. */
export interface StructuralIssue extends Issue {
    readonly path: Path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(message: string, path: Path): StructuralIssue {
    return { message, path };
}

function validateLink(value: unknown, path: Path, issues: StructuralIssue[]): void {
    if (!isRecord(value) || typeof value["_id"] !== "string") {
        issues.push(issue("Expected a link to another document", path));
    }
}

/** Check that the stored tables of an instance document are well-formed.

Issue paths are relative to the document's `tables` map, i.e. they start at
the table id, matching the paths of the instance validator's table issues.
Returns an empty array when the tables are valid. */
export function validateInstanceTablesStructure(value: unknown): StructuralIssue[] {
    const issues: StructuralIssue[] = [];
    if (!isRecord(value)) {
        return [issue("An instance document must have tables", [])];
    }
    for (const [tableId, table] of Object.entries(value)) {
        const tablePath = [tableId];
        if (!isRecord(table) || !isRecord(table["rows"])) {
            issues.push(issue(`Table \`${tableId}\` is not a well-formed table`, tablePath));
            continue;
        }
        const rowOrder = table["rowOrder"];
        if (Array.isArray(rowOrder)) {
            validateRowOrder(rowOrder, table["rows"], tableId, tablePath, issues);
        } else {
            issues.push(
                issue(`Table \`${tableId}\` must have a row order`, [...tablePath, "rowOrder"]),
            );
        }
        for (const [rowId, row] of Object.entries(table["rows"])) {
            if (!isRecord(row) || !isRecord(row["fields"])) {
                issues.push(
                    issue(`Row \`${rowId}\` of table \`${tableId}\` is not a well-formed row`, [
                        ...tablePath,
                        "rows",
                        rowId,
                    ]),
                );
            }
        }
    }
    return issues;
}

/** Validate that a row order lists exactly the rows of the table. */
function validateRowOrder(
    rowOrder: ReadonlyArray<unknown>,
    rows: Record<string, unknown>,
    tableId: string,
    tablePath: Path,
    issues: StructuralIssue[],
): void {
    const seen = new Set<string>();
    for (const [index, rowId] of rowOrder.entries()) {
        const entryPath = [...tablePath, "rowOrder", index];
        if (typeof rowId !== "string") {
            issues.push(issue("Row ids must be strings", entryPath));
            continue;
        }
        if (rows[rowId] === undefined) {
            issues.push(
                issue(
                    `Row \`${rowId}\` is listed in the row order of table \`${tableId}\` but has no contents`,
                    entryPath,
                ),
            );
        }
        if (seen.has(rowId)) {
            issues.push(
                issue(
                    `Row \`${rowId}\` is listed in the row order of table \`${tableId}\` more than once`,
                    entryPath,
                ),
            );
        }
        seen.add(rowId);
    }
    for (const rowId of Object.keys(rows)) {
        if (!seen.has(rowId)) {
            issues.push(
                issue(`Row \`${rowId}\` is missing from the row order of table \`${tableId}\``, [
                    ...tablePath,
                    "rows",
                    rowId,
                ]),
            );
        }
    }
}

/** Check that an instance document is structurally well-formed.

Issue paths are relative to the document root. Returns an empty array when
the document is valid. */
export function validateInstanceDocumentStructure(document: Readonly<Document>): StructuralIssue[] {
    const value: unknown = document;
    if (!isRecord(value)) {
        return [issue("A document must be an object", [])];
    }
    if (value["type"] !== "instance") {
        return [issue(`Expected a document of type "instance"`, ["type"])];
    }

    const issues: StructuralIssue[] = [];
    if (typeof value["name"] !== "string") {
        issues.push(issue("A document must have a name", ["name"]));
    }
    validateLink(value["instanceOf"], ["instanceOf"], issues);
    for (const tableIssue of validateInstanceTablesStructure(value["tables"])) {
        issues.push({ message: tableIssue.message, path: ["tables", ...(tableIssue.path ?? [])] });
    }
    return issues;
}
