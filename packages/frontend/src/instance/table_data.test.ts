// @vitest-environment happy-dom
import { createRenderEffect, createRoot, createSignal } from "solid-js";
import { describe, expect, test } from "vitest";

import type { FieldValue, InstanceTable, TableIssue } from "catcolab-documents";
import { createInstanceTableData } from "./table_data";

function tables(values = ["a", "b"]): InstanceTable[] {
    return [
        {
            id: "table",
            label: "Table",
            headers: [{ id: "field", label: "Field", type: { tag: "String" } }],
            get rows() {
                return values.map((value, index) => ({
                    id: `row-${value[0]}`,
                    index,
                    get fields(): FieldValue[] {
                        return [
                            {
                                tag: "String" as const,
                                content: {
                                    path: [
                                        "table",
                                        "rows",
                                        `row-${value[0]}`,
                                        "fields",
                                        "field",
                                    ],
                                    value,
                                },
                            },
                        ];
                    },
                }));
            },
        },
    ];
}

describe("instance table reconciliation", () => {
    test("fresh validation views do not invalidate unchanged cells", () => {
        const fixture = createRoot((dispose) => {
            const [validation, publish] = createSignal({
                tables: tables(),
                issues: [] as TableIssue[],
            });
            const data = createInstanceTableData(validation);
            const table = data.tables[0]!;
            const row = table.rows[0]!;
            const field = row.fields[0]!;
            let firstCellRuns = 0;
            let secondCellRuns = 0;
            createRenderEffect(() => {
                const field = data.tables[0]!.rows[0]!.fields[0]!;
                if (field.tag === "String") {
                    void field.content.value;
                }
                firstCellRuns += 1;
            });
            createRenderEffect(() => {
                const field = data.tables[0]!.rows[1]!.fields[0]!;
                if (field.tag === "String") {
                    void field.content.value;
                }
                secondCellRuns += 1;
            });
            return {
                dispose, publish, data, table, row, field,
                runs: () => [firstCellRuns, secondCellRuns],
            };
        });
        try {
            fixture.publish({ tables: tables(), issues: [] });
            expect(fixture.runs()).toEqual([1, 1]);
            expect(fixture.data.tables[0]).toBe(fixture.table);
            expect(fixture.data.tables[0]!.rows[0]).toBe(fixture.row);
            expect(fixture.row.fields[0]).toBe(fixture.field);

            fixture.publish({ tables: tables(["a changed", "b"]), issues: [] });
            expect(fixture.runs()).toEqual([2, 1]);
        } finally {
            fixture.dispose();
        }
    });

    test("row reordering updates positions and removal clears the data", () => {
        createRoot((dispose) => {
            const [validation, publish] = createSignal<{
                tables: InstanceTable[];
                issues: TableIssue[];
            }>();
            const data = createInstanceTableData(validation);
            publish({ tables: tables(), issues: [] });
            const firstRow = data.tables[0]!.rows[0]!;
            publish({ tables: tables(["b", "a"]), issues: [] });
            expect(data.tables[0]!.rows[1]).toBe(firstRow);
            expect(firstRow.index).toBe(1);
            publish(undefined);
            expect(data.tables).toHaveLength(0);
            expect(data.issues).toHaveLength(0);
            dispose();
        });
    });
});
