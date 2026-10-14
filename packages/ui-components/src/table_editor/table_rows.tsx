import { Index, Show } from "solid-js";

import type { InstanceTable, TableHeader, TableRow } from "catcolab-documents";
import { fieldOf } from "./display";
import { GridCell } from "./grid_cell";

import styles from "./table_editor.module.css";

/** The data rows of the grid. */
export function TableRows(props: {
    rows: ReadonlyArray<TableRow>;
    headers: ReadonlyArray<TableHeader>;
    headerIndex: () => ReadonlyMap<string, number>;
    tables: ReadonlyArray<InstanceTable>;
    onDeleteRow: (row: TableRow) => void;
}) {
    return (
        <tbody>
            <Index each={props.rows}>
                {(row) => (
                    <BodyRow
                        row={row()}
                        headers={props.headers}
                        headerIndex={props.headerIndex}
                        tables={props.tables}
                        onDeleteRow={props.onDeleteRow}
                    />
                )}
            </Index>
        </tbody>
    );
}

/** A single data row: a row header, one cell per column, and a delete button. */
function BodyRow(props: {
    row: TableRow;
    headers: ReadonlyArray<TableHeader>;
    headerIndex: () => ReadonlyMap<string, number>;
    tables: ReadonlyArray<InstanceTable>;
    onDeleteRow: (row: TableRow) => void;
}) {
    return (
        <tr aria-rowindex={props.row.index + 2}>
            <th class={styles.rowHeader} scope="row" />
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
                            row={props.row}
                            header={header()}
                            field={fieldOf(props.row, props.headerIndex().get(header().id) ?? -1)}
                            tables={props.tables}
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
                        onClick={() => props.onDeleteRow(props.row)}
                    >
                        ×
                    </button>
                </td>
            </Show>
        </tr>
    );
}
