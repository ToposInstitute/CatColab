import type { TableIssue } from "./errors";
import type { FieldValue, InstanceTable, TableHeader, TableRow } from "./tables";

/** Reuse objects from a previous snapshot of the tables wherever the new
snapshot is equal, so that consumers can skip unchanged tables and rows by
identity. */
export function shareTables(
    prev: ReadonlyArray<InstanceTable> | undefined,
    next: ReadonlyArray<InstanceTable>,
): ReadonlyArray<InstanceTable> {
    if (prev === undefined) {
        return next;
    }
    const prevById = new Map(prev.map((table) => [table.id, table]));
    let allShared = prev.length === next.length;
    const shared = next.map((table, i) => {
        const previous = prevById.get(table.id);
        const result = previous ? shareTable(previous, table) : table;
        if (result !== prev[i]) {
            allShared = false;
        }
        return result;
    });
    return allShared ? prev : shared;
}

function shareTable(prev: InstanceTable, next: InstanceTable): InstanceTable {
    const headers = headersEqual(prev.headers, next.headers) ? prev.headers : next.headers;
    let rowsShared = headers === prev.headers && prev.rows.length === next.rows.length;
    const rows = next.rows.map((row, i) => {
        // Field paths depend on the header ids, so rows are only comparable
        // when the headers are unchanged.
        const previous = headers === prev.headers ? prev.rows[i] : undefined;
        const result = previous && rowsEqual(previous, row) ? previous : row;
        if (result !== prev.rows[i]) {
            rowsShared = false;
        }
        return result;
    });
    if (rowsShared && headers === prev.headers && prev.label === next.label) {
        return prev;
    }
    return { id: next.id, label: next.label, headers, rows: rowsShared ? prev.rows : rows };
}

function headersEqual(prev: ReadonlyArray<TableHeader>, next: ReadonlyArray<TableHeader>): boolean {
    return (
        prev.length === next.length &&
        prev.every((header, i) => {
            const other = next[i]!;
            return (
                header.id === other.id &&
                header.label === other.label &&
                header.type.tag === other.type.tag &&
                (header.type.tag !== "RowRef" ||
                    (other.type.tag === "RowRef" &&
                        header.type.content.id === other.type.content.id))
            );
        })
    );
}

function rowsEqual(prev: TableRow, next: TableRow): boolean {
    return (
        prev.id === next.id &&
        prev.index === next.index &&
        prev.fields.length === next.fields.length &&
        prev.fields.every((field, i) => fieldsEqual(field, next.fields[i]!))
    );
}

function fieldsEqual(prev: FieldValue, next: FieldValue): boolean {
    if (prev.tag !== next.tag) {
        return false;
    }
    switch (prev.tag) {
        case "Null":
            return true;
        case "RowRef":
            return prev.content.id === (next as typeof prev).content.id;
        default:
            return prev.content.value === (next as typeof prev).content.value;
    }
}

/** Reuse issue objects from a previous snapshot wherever the new issues are equal. */
export function shareIssues(
    prev: ReadonlyArray<TableIssue> | undefined,
    next: ReadonlyArray<TableIssue>,
): ReadonlyArray<TableIssue> {
    if (prev === undefined) {
        return next;
    }
    const prevByKey = new Map<string, TableIssue>();
    for (const issue of prev) {
        prevByKey.set(issueKey(issue), issue);
    }
    let allShared = prev.length === next.length;
    const shared = next.map((issue, i) => {
        const result = prevByKey.get(issueKey(issue)) ?? issue;
        if (result !== prev[i]) {
            allShared = false;
        }
        return result;
    });
    return allShared ? prev : shared;
}

function issueKey(issue: TableIssue): string {
    const equationId = issue.issueType === "EquationViolation" ? issue.equationId : "";
    return [issue.issueType, equationId, issue.message, ...issue.path].join("\u0000");
}
