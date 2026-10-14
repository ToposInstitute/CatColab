import { createEffect, createSignal, Show, Index } from "solid-js";

import type { InstanceTable, LiteralValue, TableHeader, TableRow } from "catcolab-documents";
import type { FocusHandle } from "../util/focus";
import { ColumnHeader } from "./column_header";
import { COLUMN_WIDTHS, DELETE_COLUMN_WIDTH, EMPTY_COLUMN_WIDTH } from "./display";
import { EditProvider, useCellEdit } from "./edit";
import { GridFocus, useGridFocus } from "./grid_focus";
import {
    makeCellKey,
    navigationDirection,
    neighborKey,
    parseCellKey,
    type CellKey,
} from "./navigation";
import { TableRows } from "./table_rows";
import type { IssueLookup } from "./validation";

import styles from "./table_editor.module.css";

type TableGridProps = {
    issuesAt: IssueLookup;
    onDeleteOrphanedColumn?: (header: TableHeader) => void;
    focus: FocusHandle;
    table: InstanceTable;
    tables: ReadonlyArray<InstanceTable>;
    onSetField: (row: TableRow, header: TableHeader, value: LiteralValue | TableRow) => void;
    onAddRow: () => void;
    onDeleteRow: (row: TableRow) => void;
};

export function TableGrid(props: TableGridProps) {
    // Remember where each row was, so that the selection can stay at its
    // position when the selected row is removed.
    const lastRowPositions = new Map<string, number>();
    createEffect(() => {
        props.table.rows.forEach((row, index) => lastRowPositions.set(row.id, index));
    });

    /** Map a selected cell to the nearest cell that still exists.

    A removed row is replaced by the row at its last known position; a removed
    column by the first column. Returns null when no cell remains at all.
     */
    const resolveCell = (key: CellKey): CellKey | null => {
        const { headerId, rowId } = parseCellKey(key);
        const rows = props.table.rows;
        const headers = props.table.headers;
        if (rows.length === 0 || headers.length === 0) {
            return null;
        }
        const rowIndex = rows.findIndex((row) => row.id === rowId);
        const position =
            rowIndex >= 0 ? rowIndex : Math.min(lastRowPositions.get(rowId) ?? 0, rows.length - 1);
        const header = headers.find((candidate) => candidate.id === headerId) ?? headers[0]!;
        return makeCellKey(header.id, rows[position]!.id);
    };

    return (
        <GridFocus
            focus={props.focus}
            resolveCell={resolveCell}
        >
            <EditProvider
                table={() => props.table}
                tables={() => props.tables}
                onSetField={props.onSetField}
                onAddRow={props.onAddRow}
            >
                <div class={styles.scrollViewport}>
                    <GridContent {...props} />
                </div>
                <Show when={props.table.label !== null}>
                    <Footer />
                </Show>
            </EditProvider>
        </GridFocus>
    );
}

/** The footer with the button for adding a row. */
function Footer() {
    const edit = useCellEdit();
    return (
        <div
            class={styles.footer}
            onFocusOut={(evt) => {
                const footer = evt.currentTarget;
                queueMicrotask(() => {
                    if (footer.isConnected && !footer.contains(document.activeElement)) {
                        edit.cancelPendingSelection();
                    }
                });
            }}
        >
            <button class={styles.addRow} type="button" onClick={() => edit.addRow()}>
                + Row
            </button>
        </div>
    );
}

function GridContent(props: TableGridProps) {
    const focus = useGridFocus();
    const edit = useCellEdit();
    const headers = () => props.table.headers;
    const headerIndex = edit.headerIndex;
    const [deletingColumnId, setDeletingColumnId] = createSignal<string | null>(null);

    return (
        <div
            class={styles.scrollArea}
            tabindex={-1}
            onFocusOut={(evt) => {
                const grid = evt.currentTarget;
                const setFocused = props.focus.setFocused;
                queueMicrotask(() => {
                    if (grid.isConnected && !grid.contains(document.activeElement)) {
                        // Leaving the grid cancels the pending selection of
                        // a row being added: the user is gone, so the row
                        // must not take the focus when it appears.
                        edit.cancelPendingSelection();
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
                const key = focus.activeKey();
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
                    <col style={{ width: `${DELETE_COLUMN_WIDTH}px` }} />
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
                                    <th
                                        class={styles.columnHeader}
                                        classList={{
                                            [styles.columnDeleting]:
                                                deletingColumnId() === header().id,
                                        }}
                                        scope="col"
                                    >
                                        <ColumnHeader
                                            header={header()}
                                            onDelete={
                                                props.table.label !== null &&
                                                header().type.tag === "Unknown"
                                                    ? props.onDeleteOrphanedColumn
                                                    : undefined
                                            }
                                            onDeleting={setDeletingColumnId}
                                        />
                                    </th>
                                )}
                            </Index>
                        </Show>
                        <th class={styles.columnHeader} scope="col" />
                    </tr>
                </thead>
                <TableRows
                    tableId={props.table.id}
                    issuesAt={props.issuesAt}
                    deletingColumnId={deletingColumnId()}
                    rows={props.table.rows}
                    headers={headers()}
                    headerIndex={headerIndex}
                    tables={props.tables}
                    onDeleteRow={props.onDeleteRow}
                />
            </table>
        </div>
    );
}
