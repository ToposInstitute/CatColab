import { Attr } from "catcolab-logics/simple-schema";

import type { NotebookCell, ObjectCell, TableRow } from "catcolab-documents";

export const I32_MIN = -2_147_483_648;
export const I32_MAX = 2_147_483_647;

export type FloatToIntegerRule = "round" | "truncate" | "clear";
export type FloatToIntegerClassification = "unchanged" | "converted" | "cleared" | "unresolved";
export type FloatToIntegerUnresolvedReason = "unsupported" | "non-finite" | "out-of-range";

type ResolvedValuePlan = {
    input: unknown;
    output: number | undefined;
};

export type FloatToIntegerValuePlan =
    | (ResolvedValuePlan & { classification: "unchanged" })
    | (ResolvedValuePlan & { classification: "converted"; output: number })
    | (ResolvedValuePlan & { classification: "cleared"; output: undefined })
    | {
          classification: "unresolved";
          input: unknown;
          output: undefined;
          reason: FloatToIntegerUnresolvedReason;
      };

export type FloatToIntegerSummary = {
    total: number;
    affected: number;
    unchanged: number;
    converted: number;
    cleared: number;
    unresolved: number;
};

export type FloatToIntegerValuesPlan = {
    rule: FloatToIntegerRule;
    values: FloatToIntegerValuePlan[];
    summary: FloatToIntegerSummary;
    canApply: boolean;
};

export type FloatToIntegerRowPlan = FloatToIntegerValuePlan & {
    row: TableRow;
    rowId: string;
};

export type FloatToIntegerMigrationPlan = {
    rule: FloatToIntegerRule;
    attribute: NotebookCell<typeof Attr>;
    rows: FloatToIntegerRowPlan[];
    summary: FloatToIntegerSummary;
    canApply: boolean;
};

function isI32(value: number): boolean {
    return Number.isInteger(value) && value >= I32_MIN && value <= I32_MAX;
}

/** Classify one stored value without reading or changing a document. */
export function classifyFloatToIntegerValue(
    input: unknown,
    rule: FloatToIntegerRule,
): FloatToIntegerValuePlan {
    if (input === undefined) {
        return { classification: "unchanged", input, output: undefined };
    }
    if (rule === "clear") {
        return typeof input === "number" && isI32(input)
            ? { classification: "unchanged", input, output: input }
            : { classification: "cleared", input, output: undefined };
    }
    if (typeof input !== "number") {
        return { classification: "unresolved", input, output: undefined, reason: "unsupported" };
    }
    if (!Number.isFinite(input)) {
        return { classification: "unresolved", input, output: undefined, reason: "non-finite" };
    }
    if (Number.isInteger(input)) {
        return isI32(input)
            ? { classification: "unchanged", input, output: input }
            : { classification: "unresolved", input, output: undefined, reason: "out-of-range" };
    }
    const output = rule === "round" ? Math.round(input) : Math.trunc(input);
    return isI32(output)
        ? { classification: "converted", input, output }
        : { classification: "unresolved", input, output: undefined, reason: "out-of-range" };
}

export function summarizeFloatToIntegerValues(
    values: readonly FloatToIntegerValuePlan[],
): FloatToIntegerSummary {
    const summary: FloatToIntegerSummary = {
        total: values.length,
        affected: 0,
        unchanged: 0,
        converted: 0,
        cleared: 0,
        unresolved: 0,
    };
    for (const value of values) {
        summary[value.classification] += 1;
        if (value.classification !== "unchanged") {
            summary.affected += 1;
        }
    }
    return summary;
}

/** Plan an aligned list of raw values, suitable for previews and pure tests. */
export function planFloatToIntegerValues(
    inputs: readonly unknown[],
    rule: FloatToIntegerRule,
): FloatToIntegerValuesPlan {
    const values = inputs.map((input) => classifyFloatToIntegerValue(input, rule));
    const summary = summarizeFloatToIntegerValues(values);
    return { rule, values, summary, canApply: summary.unresolved === 0 };
}

/** Read an attribute's rows and attach the pure value plan to each source row. */
export function planFloatToIntegerMigration(
    doc: {
        rowsOf: (entity: ObjectCell) => TableRow[];
        rowId: (entity: ObjectCell, row: TableRow) => string | undefined;
        rowValue: (entity: ObjectCell, row: TableRow, morphismId: string) => unknown;
    },
    attribute: NotebookCell<typeof Attr>,
    rule: FloatToIntegerRule,
): FloatToIntegerMigrationPlan {
    const sourceRows = attribute.from ? doc.rowsOf(attribute.from) : [];
    const valuesPlan = planFloatToIntegerValues(
        sourceRows.map((row) => doc.rowValue(attribute.from!, row, attribute.id)),
        rule,
    );
    const rows = sourceRows.map((row, index): FloatToIntegerRowPlan => {
        const rowId = doc.rowId(attribute.from!, row);
        if (!rowId) {
            throw new Error("Migration row is no longer in the instance.");
        }
        return Object.assign({ row, rowId }, valuesPlan.values[index]!);
    });
    return {
        rule,
        attribute,
        rows,
        summary: valuesPlan.summary,
        canApply: valuesPlan.canApply,
    };
}
