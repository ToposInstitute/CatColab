import { type Accessor, createComputed, untrack } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import type { InstanceTable, TableIssue } from "catcolab-documents";

/** Reconcile validation's lazy views into stable, fine-grained editor data.

Validation creates fresh table and row views even when only one field changed.
Passing those views straight to the grid invalidates every cell. Materialize
once per publication, then reconcile by id so unchanged rows, headers, fields,
and issues retain their reactive identities. */
export function createInstanceTableData(
    validation: Accessor<
        | {
              readonly tables: ReadonlyArray<InstanceTable>;
              readonly issues: ReadonlyArray<TableIssue>;
          }
        | undefined
    >,
) {
    const [data, setData] = createStore<{
        tables: ReadonlyArray<InstanceTable>;
        issues: ReadonlyArray<TableIssue>;
    }>({ tables: [], issues: [] });

    createComputed(() => {
        const value = validation();
        const tables = untrack(() =>
            (value?.tables ?? []).map((table) => ({
                id: table.id,
                label: table.label,
                headers: table.headers.map((header) => ({
                    ...header,
                    type: structuredClone(header.type),
                })),
                rows: table.rows.map((row, index) => ({
                    id: row.id,
                    index,
                    fields: row.fields.map((field) => structuredClone(field)),
                })),
            })),
        );
        setData(reconcile({ tables, issues: structuredClone(value?.issues ?? []) }, { key: "id" }));
    });

    return data;
}
