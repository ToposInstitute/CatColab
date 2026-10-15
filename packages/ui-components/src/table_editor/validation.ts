import { createMemo, type Accessor } from "solid-js";

import type { TableIssue } from "catcolab-documents";

/** Index issues by their full document path, not by mutable row/column positions. */
export function createIssueIndex(issues: Accessor<ReadonlyArray<TableIssue>>) {
    const index = createMemo(() => {
        const result = new Map<string, TableIssue[]>();
        for (const issue of issues()) {
            const key = pathKey(issue.path);
            const entries = result.get(key) ?? [];
            entries.push(issue);
            result.set(key, entries);
        }
        return result;
    });
    return (path: ReadonlyArray<string>): ReadonlyArray<TableIssue> =>
        index().get(pathKey(path)) ?? [];
}

export type IssueLookup = ReturnType<typeof createIssueIndex>;

function pathKey(path: ReadonlyArray<string>): string {
    return path.join("\u0000");
}

export function issueMessage(issue: TableIssue): string {
    if (issue.issueType === "EquationViolation") {
        const label = issue.equationLabel.join(".");
        return label ? `Constraint \`${label}\` is violated` : "Unnamed constraint is violated";
    }
    return issue.message;
}
