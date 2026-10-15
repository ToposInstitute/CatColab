import { Index, Show } from "solid-js";

import type { InstanceTable, TableHeader, TableRow } from "catcolab-documents";
import { GridCell } from "./grid_cell";
import { RowIssueTooltip } from "./row_issue_tooltip";
import type { IssueLookup } from "./validation";

import styles from "./table_editor.module.css";

/** The data rows of the grid. */
export function GridRows(props: {
    tableId: string;
    issuesAt: IssueLookup;
    deletingColumnId: string | null;
    rows: ReadonlyArray<TableRow>;
    headers: ReadonlyArray<TableHeader>;
    headerIndex: () => ReadonlyMap<string, number>;
    allTables: ReadonlyArray<InstanceTable>;
    onDeleteRow: (row: TableRow) => void;
}) {
    return (
        <tbody>
            <Index each={props.rows}>
                {(row) => (
                    // ARIA row indices are one-based, and row 1 is the column header.
                    <tr aria-rowindex={row().index + 2}>
                        <RowIssueTooltip
                            issues={props.issuesAt([props.tableId, "rows", row().id])}
                        />
                        <Show
                            when={props.headers.length > 0}
                            fallback={
                                <>
                                    <td class={styles.cell} role="gridcell" />
                                    <td class={styles.deleteCell} />
                                </>
                            }
                        >
                            <Index each={props.headers}>
                                {(header) => (
                                    <GridCell
                                        row={row()}
                                        header={header()}
                                        field={
                                            row().fields[props.headerIndex().get(header().id) ?? -1]
                                        }
                                        allTables={props.allTables}
                                        issuesAt={props.issuesAt}
                                        deleting={props.deletingColumnId === header().id}
                                    />
                                )}
                            </Index>
                            <td class={styles.deleteCell}>
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
                        </Show>
                    </tr>
                )}
            </Index>
        </tbody>
    );
}
