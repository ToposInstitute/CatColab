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
                    />
                )}
            </Index>
        </tbody>
    );
}

/** A single data row: a row header followed by one cell per column. */
function BodyRow(props: {
    row: TableRow;
    headers: ReadonlyArray<TableHeader>;
    headerIndex: () => ReadonlyMap<string, number>;
    tables: ReadonlyArray<InstanceTable>;
}) {
    return (
        <tr aria-rowindex={props.row.index + 2}>
            <th class={styles.rowHeader} scope="row" />
            <Show
                when={props.headers.length > 0}
                fallback={<td class={styles.cell} role="gridcell" />}
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
            </Show>
        </tr>
    );
}
