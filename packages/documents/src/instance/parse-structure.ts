import type { InstanceDocument } from "catcolab-document-methods";
import {
    isRecord,
    record,
    order,
    type WithIssues,
    type StructuralIssue,
    type StructurallyValid,
} from "../document/parse-structure";

const instanceCache = new WeakMap<object, WithIssues<StructurallyValid<InstanceDocument>>>();

/** Build a read-only instance document with normalized table, row, and field containers */
export function parseInstanceStructure(
    snapshot: Omit<Readonly<InstanceDocument>, "tables"> & { readonly tables?: unknown },
): WithIssues<StructurallyValid<InstanceDocument>> {
    const cached = instanceCache.get(snapshot);
    if (cached) {
        return cached;
    }
    const issues: StructuralIssue[] = [];
    const tables = new Map<string, unknown>();
    for (const [id, table] of Object.entries(record(snapshot.tables, ["tables"], issues))) {
        const path = ["tables", id];
        if (!isRecord(table)) {
            issues.push({ message: "Expected a table", path });
            continue;
        }
        const rows = new Map<string, unknown>();
        for (const [rowId, row] of Object.entries(
            record(table["rows"], [...path, "rows"], issues),
        )) {
            const rowPath = [...path, "rows", rowId];
            if (!isRecord(row)) {
                issues.push({ message: "Expected a row", path: rowPath });
                continue;
            }
            rows.set(rowId, {
                ...row,
                fields: record(row["fields"], [...rowPath, "fields"], issues),
            });
        }
        const contents = Object.fromEntries(rows);
        tables.set(id, {
            ...table,
            rows: contents,
            rowOrder: order(table["rowOrder"], contents, [...path, "rowOrder"], issues),
        });
    }
    const result: WithIssues<StructurallyValid<InstanceDocument>> = {
        value: {
            ...snapshot,
            tables: Object.fromEntries(tables),
        } as unknown as StructurallyValid<InstanceDocument>,
        issues,
    };
    instanceCache.set(snapshot, result);
    return result;
}
