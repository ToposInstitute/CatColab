import { Show, Index } from "solid-js";

import type { InstanceTable, LiteralValue, TableHeader, TableRow } from "catcolab-documents";
import type { FocusHandle } from "../util/focus";
import { ColumnHeader } from "./column_header";
import { COLUMN_WIDTHS, EMPTY_COLUMN_WIDTH } from "./display";
import { EditProvider, useCellEdit } from "./edit";
import { GridFocus, useGridFocus } from "./grid_focus";
import { firstCellKey, navigationDirection, neighborKey } from "./navigation";
import { TableRows } from "./table_rows";

import styles from "./table_editor.module.css";

type TableGridProps = {
    focus: FocusHandle;
    table: InstanceTable;
    tables: ReadonlyArray<InstanceTable>;
    onSetField: (row: TableRow, header: TableHeader, value: LiteralValue | TableRow) => void;
};

export function TableGrid(props: TableGridProps) {
    return (
        <GridFocus focus={props.focus} firstCell={firstCellKey(props.table)}>
            <EditProvider
                table={() => props.table}
                tables={() => props.tables}
                onSetField={props.onSetField}
            >
                <GridContent {...props} />
            </EditProvider>
        </GridFocus>
    );
}

function GridContent(props: TableGridProps) {
    const focus = useGridFocus();
    const edit = useCellEdit();
    const headers = () => props.table.headers;
    const headerIndex = edit.headerIndex;

    return (
        <div
            class={styles.scrollArea}
            tabindex={-1}
            onFocusOut={(evt) => {
                const grid = evt.currentTarget;
                const setFocused = props.focus.setFocused;
                queueMicrotask(() => {
                    if (grid.isConnected && !grid.contains(document.activeElement)) {
                        setFocused(false);
                    }
                });
            }}
            onKeyDown={(evt) => {
                if (evt.defaultPrevented) {
                    return;
                }
                // Leave the open cell editor to handle its own keys. Keys
                // pressed on the boolean checkbox bubble and act on the
                // selected cell.
                const target = evt.target as HTMLElement;
                if (
                    target !== evt.currentTarget &&
                    target.tagName === "INPUT" &&
                    (target as HTMLInputElement).type === "text"
                ) {
                    return;
                }
                // The container uses the same tab stop as the cells.
                const key = focus.tabStop();
                if (!key) {
                    return;
                }
                const direction = navigationDirection(evt);
                if (!direction) {
                    if (edit.onCellKey(evt, key)) {
                        evt.preventDefault();
                    }
                    return;
                }
                const next = neighborKey(props.table, headerIndex(), key, direction);
                if (!next && evt.key === "Tab") {
                    return;
                }
                if (next) {
                    focus.cellFocus(next).setFocused(true);
                }
                evt.preventDefault();
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
                    rows={props.table.rows}
                    headers={headers()}
                    headerIndex={headerIndex}
                    tables={props.tables}
                />
            </table>
        </div>
    );
}
