import { createMemo, Index, Show } from "solid-js";

import type { InstanceTable } from "catcolab-documents";
import { ColumnHeader } from "./column_header";
import { COLUMN_WIDTHS, EMPTY_COLUMN_WIDTH } from "./display";
import { onCellKeyDown, type SelectionController } from "./selection";
import { TableRows } from "./table_rows";

import styles from "./table_editor.module.css";

/** The grid of column headers and data rows, including column sizing. */
export function TableGrid(props: {
    selection: SelectionController;
    table: InstanceTable;
    tables: ReadonlyArray<InstanceTable>;
}) {
    const headers = () => props.table.headers;
    const headerIndex = createMemo(
        () => new Map(headers().map((header, index) => [header.id, index] as const)),
    );

    return (
        <div
            class={styles.scrollArea}
            tabindex={-1}
            onKeyDown={(evt) => {
                // The grid itself is focused, e.g. after the focused row was
                // unmounted due to virtualization: act on the cell the
                // selection is parked on.
                if (evt.target === evt.currentTarget) {
                    const key = props.selection.targetKey();
                    if (key) {
                        onCellKeyDown(props.selection, key, evt);
                    }
                }
            }}
        >
            <table class={styles.grid} role="grid" aria-rowcount={props.table.rows.length + 1}>
                <colgroup>
                    <col class={styles.rowHeaderColumn} />
                    <Show
                        when={headers().length > 0}
                        fallback={<col style={{ width: `${EMPTY_COLUMN_WIDTH}px` }} />}
                    >
                        <Index each={headers()}>
                            {(header) => (
                                <col style={{ width: `${COLUMN_WIDTHS[header().type.tag]}px` }} />
                            )}
                        </Index>
                    </Show>
                </colgroup>
                <thead>
                    <tr>
                        <th class={styles.columnHeader} scope="col" />
                        <Show
                            when={headers().length > 0}
                            fallback={<th class={styles.columnHeader} scope="col" />}
                        >
                            <Index each={headers()}>
                                {(header) => (
                                    <th class={styles.columnHeader} scope="col">
                                        <ColumnHeader header={header()} />
                                    </th>
                                )}
                            </Index>
                        </Show>
                    </tr>
                </thead>
                <TableRows
                    selection={props.selection}
                    rows={props.table.rows}
                    headers={headers()}
                    headerIndex={headerIndex}
                    tables={props.tables}
                />
            </table>
        </div>
    );
}
