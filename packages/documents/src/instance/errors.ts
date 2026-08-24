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
    readonly issueType: "MissingValue" | "DanglingRowRef" | "MistypedRowRef" | "MistypedLiteral";
}
