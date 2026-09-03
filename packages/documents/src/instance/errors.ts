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

/** A violation of a path equation in the schema by a row of an instance
 * table, or a summary of further such violations. */
export interface EquationViolationIssue extends Issue {
    /** Path to the violating row, or to its table for a summary issue. */
    readonly path: [string] | [string, "rows", string];
    readonly issueType: "EquationViolation";
    /** Id of the violated equation in the schema. */
    readonly equationId: string;
}

/** A problem found while validating an instance's tables. */
export type TableIssue = TableFieldIssue | OrphanedTableIssue | EquationViolationIssue;
