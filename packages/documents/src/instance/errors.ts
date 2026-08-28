import type { Issue } from "../result";

/** Path addressing a field, relative to the document's `tables` map. */
export type FieldPath = [
    string, // Table id.
    "rows",
    string, // Row id.
    "fields",
    string, // Field id.
];

/** A problem with one field in an instance table. */
export interface TableFieldIssue extends Issue {
    readonly path: FieldPath;
    readonly issueType:
        | "MissingValue"
        | "DanglingRowRef"
        | "MistypedRowRef"
        | "MistypedLiteral"
        | "OrphanedField";
}

/** A problem with a stored table that has no entity in the schema. */
export interface OrphanedTableIssue extends Issue {
    readonly path: [
        string, // Table id.
    ];
    readonly issueType: "OrphanedTable";
}

/** A problem found while validating an instance's tables. */
export type TableIssue = TableFieldIssue | OrphanedTableIssue;
