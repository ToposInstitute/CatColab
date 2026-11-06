import { Index, Show } from "solid-js";

import type { InstanceTable, TableHeader, TableRow } from "catcolab-documents";
import { GridCell } from "./grid_cell";
import { RowLabelCell } from "./row_label_cell";
import type { IssueLookup } from "./validation";

import styles from "./table_editor.module.css";

/** The data rows of the grid. */
export function GridRows(props: {
    tableId: string;
    issuesAt: IssueLookup;
    deletingColumnId: string | null;
    rows: ReadonlyArray<TableRow>;
    totalRows: number;
    topSpacer: number;
    bottomSpacer: number;
    headers: ReadonlyArray<TableHeader>;
    headerIndex: () => ReadonlyMap<string, number>;
    allTables: ReadonlyArray<InstanceTable>;
    onDeleteRow: (row: TableRow) => void;
}) {
    return (
        <tbody>
            <Spacer height={props.topSpacer} columns={props.headers.length + 2} />
            <Index each={props.rows}>
                {(row) => (
                    // ARIA row indices are one-based, and row 1 is the column header.
                    <tr aria-rowindex={row().index + 2}>
                        <RowLabelCell
                            row={row()}
                            issues={props.issuesAt([props.tableId, "rows", row().id])}
                        />
                        <Index each={props.headers}>
                            {(header) => (
                                <GridCell
                                    row={row()}
                                    header={header()}
                                    field={row().fields[props.headerIndex().get(header().id) ?? -1]}
                                    allTables={props.allTables}
                                    issuesAt={props.issuesAt}
                                    deleting={props.deletingColumnId === header().id}
                                />
                            )}
                        </Index>
                        <td class={styles.deleteCell} aria-colindex={props.headers.length + 2}>
                            <button
                                type="button"
                                class={styles.deleteRow}
                                title="Delete row"
                                aria-label="Delete row"
                                tabindex={-1}
                                // Clicking must not move focus out of the grid: the
                                // selection and any open editor are left alone until
                                // the row is actually removed.
                                onMouseDown={(evt) => evt.preventDefault()}
                                onClick={() => props.onDeleteRow(row())}
                            >
                                ×
                            </button>
                        </td>
                    </tr>
                )}
            </Index>
            <Spacer height={props.bottomSpacer} columns={props.headers.length + 2} />
        </tbody>
    );
}

function Spacer(props: { height: number; columns: number }) {
    return (
        <Show when={props.height > 0}>
            <tr aria-hidden="true" class={styles.spacer}>
                <td colspan={props.columns} style={{ height: `${props.height}px` }} />
            </tr>
        </Show>
    );
}
