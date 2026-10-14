import { createSignal, Show, Index } from "solid-js";

import type { InstanceTable, LiteralValue, TableHeader, TableRow } from "catcolab-documents";
import type { FocusHandle } from "../util/focus";
import { ColumnHeader } from "./column_header";
import { COLUMN_WIDTHS, DELETE_COLUMN_WIDTH, EMPTY_COLUMN_WIDTH } from "./display";
import { GridProvider, useGridController } from "./grid_controller";
import { navigationDirection, neighborKey } from "./navigation";
import { TableRows } from "./table_rows";
import type { IssueLookup } from "./validation";

import styles from "./table_editor.module.css";

type TableGridProps = {
    issuesAt: IssueLookup;
    onDeleteOrphanedColumn?: (header: TableHeader) => void;
    focus: FocusHandle;
    table: InstanceTable;
    allTables: ReadonlyArray<InstanceTable>;
    onSetField: (row: TableRow, header: TableHeader, value: LiteralValue | TableRow) => void;
    onAddRow: () => void;
    onDeleteRow: (row: TableRow) => void;
};

export function TableGrid(props: TableGridProps) {
    return (
        <GridProvider
            focus={props.focus}
            table={() => props.table}
            allTables={() => props.allTables}
            onSetField={props.onSetField}
            onAddRow={props.onAddRow}
        >
            <GridContent {...props} />
            <Show when={props.table.label !== null}>
                <Footer />
            </Show>
        </GridProvider>
    );
}

/** The footer with the button for adding a row. */
function Footer() {
    const edit = useGridController();
    return (
        <div class={styles.footer} onFocusOut={(evt) => edit.onFocusOut(evt)}>
            <button class={styles.addRow} type="button" onClick={() => edit.addRow()}>
                + Row
            </button>
        </div>
    );
}

function GridContent(props: TableGridProps) {
    const edit = useGridController();
    const headers = () => props.table.headers;
    const headerIndex = edit.headerIndex;
    const [deletingColumnId, setDeletingColumnId] = createSignal<string | null>(null);

    return (
        <div
            class={styles.scrollArea}
            tabindex={-1}
            onFocusOut={(evt) => edit.onFocusOut(evt, true)}
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
                const key = edit.activeKey();
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
                    edit.cellFocus(next).setFocused(true);
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
                    allTables={props.allTables}
                    onDeleteRow={props.onDeleteRow}
                />
            </table>
        </div>
    );
}
