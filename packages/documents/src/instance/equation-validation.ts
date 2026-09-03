/* Check that an instance's data upholds the equations of its schema.

This code is expected to be replaced by catlog implementations in the future
once a commitment to the mathematical account of instances has been made. */

import type { ElaboratedModel, EquationJudgmentSide } from "../model/elaborated-model";
import { PathEquation, type Shape } from "../shape";
import type { EquationViolationIssue } from "./errors";
import type { LiteralFieldValue, InstanceTable, TableRow } from "./tables";
import { isLiteralField } from "./tables";

/** Maximum number of counterexamples reported per equation; any further
violations are summarized in a single issue. */
const MAX_COUNTEREXAMPLES_PER_EQUATION = 10;

/** The value of one side of an equation at a row of the source table: a row
of a table, or a literal. */
type SideValue =
    | { readonly kind: "row"; readonly table: InstanceTable; readonly row: TableRow }
    | { readonly kind: "literal"; readonly field: LiteralFieldValue };

/** Check that the instance's stored data upholds the equations of its schema.

Walk the equations literally morphism by morphism and check equality of rows or
literals at the end. This is computationally expensive.

Evaluation is deliberately trusting: the schema is elaborated, so paths are
composable and well typed, and each morphism judgment says which table its
header lives in. Anything that fails to resolve during evaluation---an
unresolvable side, a missing header, or a null, mistyped, or dangling field
along the way---simply yields no result, and neither the equation at that row
nor the row is checked. In particular, problems already reported by
`validateInstanceTables` are never reported here. */
export function validatePathEquations<S extends Shape>(
    tables: ReadonlyArray<InstanceTable>,
    schemaModel: ElaboratedModel<S>,
): EquationViolationIssue[] {
    const tableById = new Map(tables.map((table) => [table.id, table]));
    const issues: EquationViolationIssue[] = [];

    for (const judgment of schemaModel.judgmentsOf(PathEquation)) {
        const sourceId = sideSource(judgment.lhs);
        if (sourceId === null || sourceId !== sideSource(judgment.rhs)) {
            continue;
        }
        const sourceTable = tableById.get(sourceId);
        if (sourceTable === undefined) {
            continue; // the source object has no table
        }
        const tableLabel = sourceTable.label ?? sourceId;
        const equationName = judgment.label.join(".") || judgment.id;

        let violations = 0;
        for (const row of sourceTable.rows) {
            const source = { table: sourceTable, row };
            const left = evaluateSide(tableById, judgment.lhs, source);
            const right = evaluateSide(tableById, judgment.rhs, source);
            if (left === undefined || right === undefined || sideValuesEqual(left, right)) {
                continue;
            }
            violations += 1;
            if (violations <= MAX_COUNTEREXAMPLES_PER_EQUATION) {
                issues.push({
                    message:
                        `Equation \`${equationName}\` is violated by a row of table \`${tableLabel}\`: ` +
                        `left-hand side yields ${describeSideValue(left)}, ` +
                        `right-hand side yields ${describeSideValue(right)}`,
                    path: [sourceId, "rows", row.id],
                    issueType: "EquationViolation",
                    equationId: judgment.id,
                });
            }
        }
        if (violations > MAX_COUNTEREXAMPLES_PER_EQUATION) {
            issues.push({
                message:
                    `Equation \`${equationName}\` is violated by ` +
                    `${violations - MAX_COUNTEREXAMPLES_PER_EQUATION} more rows of table ` +
                    `\`${tableLabel}\``,
                path: [sourceId],
                issueType: "EquationViolation",
                equationId: judgment.id,
            });
        }
    }
    return issues;
}

function sideSource<S extends Shape>(side: EquationJudgmentSide<S>): string | null {
    switch (side.kind) {
        case "object":
            return side.id;
        case "composite":
            return side.morphisms[0]?.from?.id ?? null;
    }
}

function evaluateSide<S extends Shape>(
    tableById: ReadonlyMap<string, InstanceTable>,
    side: EquationJudgmentSide<S>,
    source: { table: InstanceTable; row: TableRow },
): SideValue | undefined {
    switch (side.kind) {
        case "object":
            // The identity on an object.
            return { kind: "row", table: source.table, row: source.row };
        case "composite": {
            let current = source;
            for (const [i, morphism] of side.morphisms.entries()) {
                if (
                    morphism === null ||
                    morphism.from === null ||
                    current.table.id !== morphism.from.id
                ) {
                    return undefined; // unresolvable, or not composable
                }
                const headerIndex = current.table.headers.findIndex(
                    (header) => header.id === morphism.id,
                );
                if (headerIndex < 0) {
                    return undefined; // no such column
                }
                const header = current.table.headers[headerIndex]!;
                const field = current.row.fields[headerIndex];
                if (field === undefined || field.tag === "Null") {
                    return undefined;
                }
                const isLast = i === side.morphisms.length - 1;
                if (header.type.tag === "RowRef") {
                    if (field.tag !== "RowRef") {
                        return undefined; // mistyped, reported elsewhere
                    }
                    const target = tableById.get(header.type.content.id);
                    const row = target?.rows.find((row) => row.id === field.content.id);
                    if (target === undefined || row === undefined) {
                        return undefined; // dangling or mistyped, reported elsewhere
                    }
                    if (isLast) {
                        return { kind: "row", table: target, row };
                    }
                    current = { table: target, row };
                } else {
                    // A literal header ends the path, as elaboration ensures.
                    if (!isLast || !isLiteralField(field) || field.tag !== header.type.tag) {
                        return undefined; // mistyped literal, reported elsewhere
                    }
                    return { kind: "literal", field };
                }
            }
            return undefined; // the side is empty, hence unspecified
        }
    }
}

function sideValuesEqual(left: SideValue, right: SideValue): boolean {
    if (left.kind === "row" && right.kind === "row") {
        return left.table.id === right.table.id && left.row.id === right.row.id;
    }
    if (left.kind === "literal" && right.kind === "literal") {
        return (
            left.field.tag === right.field.tag &&
            left.field.content.value === right.field.content.value
        );
    }
    return false;
}

function describeSideValue(value: SideValue): string {
    if (value.kind === "row") {
        const label = value.table.label ?? value.table.id;
        return `row \`${value.row.id}\` of table \`${label}\``;
    }
    return JSON.stringify(value.field.content.value);
}
