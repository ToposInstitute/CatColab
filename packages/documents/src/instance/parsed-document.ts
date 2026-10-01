import type * as DocumentTypes from "catcolab-document-types";
import type { Document, Link } from "catcolab-document-types";
import type { Issue, Result } from "../result";

/* Parsing of the underlying JSON of an instance document.

The untrusted stored JSON is parsed into a known-valid structure so following
operations in this package can work without defensive per-access checks.

Malformed parts are repaired, dropped or reconciled, and every repair is
reported as an issue alongside the parsed value. In particular, the row order
of every parsed table lists exactly the rows of the table, each once, so
readers can use it without reconciling it against the rows.

Parsing is deliberately tolerant of extra fields and of semantic problems
(those are the instance validator's job). */

type Path = ReadonlyArray<PropertyKey>;

/** An issue reported while parsing; its path is always present. */
export interface StructuralIssue extends Issue {
    readonly path: Path;
}

/** A parsed value together with the issues repaired while parsing it. */
export interface WithIssues<T> {
    readonly value: T;
    readonly issues: ReadonlyArray<StructuralIssue>;
}

declare const parsed: unique symbol;

/** The stored tables of an instance document, parsed.

A branded newtype of the stored shape: only `parseInstanceTables` constructs
it, which guarantees that every table's row order lists exactly the keys of
its rows, each once, and that every row has a `fields` record. */
export type ParsedTables = Readonly<Record<string, DocumentTypes.Table>> & {
    readonly [parsed]: true;
};

/** An instance document, parsed. */
export interface ParsedInstanceDocument {
    readonly name: string;
    readonly instanceOf: Link;
    readonly tables: ParsedTables;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(message: string, path: Path): StructuralIssue {
    return { message, path };
}

/** Parse the stored tables of an instance document.

Issue paths are relative to the document's `tables` map, i.e. they start at
the table id, matching the paths of the instance validator's table issues.
Repairs: malformed tables and rows are dropped, row ids that are duplicated in
the row order or have no contents are dropped from the order, and rows missing
from the order are appended to it. When there are no issues, the given value
itself is returned (branded), so the parsed tables are a live view. */
export function parseInstanceTables(value: unknown): WithIssues<ParsedTables> {
    if (!isRecord(value)) {
        return {
            value: {} as ParsedTables,
            issues: [issue("An instance document must have tables", [])],
        };
    }
    const issues: StructuralIssue[] = [];
    const repairedTables: Record<string, DocumentTypes.Table> = {};
    for (const [tableId, table] of Object.entries(value)) {
        const tablePath = [tableId];
        if (!isRecord(table) || !isRecord(table["rows"])) {
            issues.push(issue(`Table \`${tableId}\` is not a well-formed table`, tablePath));
            continue;
        }

        const rows: Record<string, DocumentTypes.TableRow> = {};
        for (const [rowId, row] of Object.entries(table["rows"])) {
            if (!isRecord(row) || !isRecord(row["fields"])) {
                issues.push(
                    issue(`Row \`${rowId}\` of table \`${tableId}\` is not a well-formed row`, [
                        ...tablePath,
                        "rows",
                        rowId,
                    ]),
                );
                continue;
            }
            rows[rowId] = row as unknown as DocumentTypes.TableRow;
        }

        const rawRowOrder = table["rowOrder"];
        let rowOrder: string[];
        if (Array.isArray(rawRowOrder)) {
            rowOrder = parseRowOrder(rawRowOrder, table["rows"], rows, tableId, tablePath, issues);
        } else {
            issues.push(
                issue(`Table \`${tableId}\` must have a row order`, [...tablePath, "rowOrder"]),
            );
            rowOrder = Object.keys(rows);
        }

        repairedTables[tableId] = { rows, rowOrder };
    }
    if (issues.length === 0) {
        return { value: value as ParsedTables, issues };
    }
    return { value: repairedTables as ParsedTables, issues };
}

/** Parse a row order so that it lists exactly the kept rows, each once.

Ghost and duplicate entries are reported against the raw rows, so a row that
was itself dropped as malformed is not reported a second time here. */
function parseRowOrder(
    rawOrder: ReadonlyArray<unknown>,
    rawRows: Record<string, unknown>,
    keptRows: Record<string, DocumentTypes.TableRow>,
    tableId: string,
    tablePath: Path,
    issues: StructuralIssue[],
): string[] {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const [index, rowId] of rawOrder.entries()) {
        const entryPath = [...tablePath, "rowOrder", index];
        if (typeof rowId !== "string") {
            issues.push(issue("Row ids must be strings", entryPath));
            continue;
        }
        if (rawRows[rowId] === undefined) {
            issues.push(
                issue(
                    `Row \`${rowId}\` is listed in the row order of table \`${tableId}\` but has no contents`,
                    entryPath,
                ),
            );
            continue;
        }
        if (seen.has(rowId)) {
            issues.push(
                issue(
                    `Row \`${rowId}\` is listed in the row order of table \`${tableId}\` more than once`,
                    entryPath,
                ),
            );
            continue;
        }
        seen.add(rowId);
        if (keptRows[rowId] !== undefined) {
            order.push(rowId);
        }
    }
    for (const rowId of Object.keys(keptRows)) {
        if (!seen.has(rowId)) {
            issues.push(
                issue(`Row \`${rowId}\` is missing from the row order of table \`${tableId}\``, [
                    ...tablePath,
                    "rows",
                    rowId,
                ]),
            );
            order.push(rowId);
        }
    }
    return order;
}

/** Parse an instance document.

- Problems for which no sensible parsed value exists, a document that is not an
instance, has no name, or has a malformed `instanceOf` link, fail the parse
with an `Err`. 
- Repairable problems with the stored tables are reported as
issues alongside the parsed document. 
- Issue paths are relative to the document root. 

*/
export function parseInstanceDocument(
    document: Readonly<Document>,
): Result<WithIssues<ParsedInstanceDocument>, ReadonlyArray<StructuralIssue>> {
    const value: unknown = document;
    if (!isRecord(value)) {
        return { tag: "Err", content: [issue("A document must be an object", [])] };
    }
    if (value["type"] !== "instance") {
        return { tag: "Err", content: [issue(`Expected a document of type "instance"`, ["type"])] };
    }

    const fatal: StructuralIssue[] = [];
    const name = value["name"];
    if (typeof name !== "string") {
        fatal.push(issue("A document must have a name", ["name"]));
    }
    const instanceOf = value["instanceOf"];
    if (!isRecord(instanceOf) || typeof instanceOf["_id"] !== "string") {
        fatal.push(issue("Expected a link to another document", ["instanceOf"]));
    }
    if (fatal.length > 0) {
        return { tag: "Err", content: fatal };
    }

    const tables = parseInstanceTables(value["tables"]);
    return {
        tag: "Ok",
        content: {
            value: {
                name: name as string,
                instanceOf: instanceOf as unknown as Link,
                tables: tables.value,
            },
            issues: tables.issues.map((tableIssue) => ({
                message: tableIssue.message,
                path: ["tables", ...tableIssue.path],
            })),
        },
    };
}
