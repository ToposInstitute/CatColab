import { createEffect } from "solid-js";

import type { FieldValue, InstanceTable, TableHeader, TableRow } from "catcolab-documents";
import { Cell } from "./cell";
import { makeCellKey, onCellKeyDown, type SelectionController } from "./selection";

import styles from "./table_editor.module.css";

/** A focusable grid cell: selection, keyboard handling, and content.

The cell is selected when it has keyboard focus; a roving tabindex makes the
selected cell (or, before the table is ever focused, the first cell) the only
tab stop in the grid.
 */
export function GridCell(props: {
    selection: SelectionController;
    row: TableRow;
    header: TableHeader;
    field: FieldValue | undefined;
    tables: ReadonlyArray<InstanceTable>;
}) {
    const key = () => makeCellKey(props.header.id, props.row.id);
    const selected = () => props.selection.selectedKey() === key();

    let tdRef!: HTMLTableCellElement;

    // Restore DOM focus when the selection moves, including to this cell.
    createEffect(() => {
        if (selected() && document.activeElement !== tdRef) {
            tdRef.focus({ preventScroll: true });
        }
    });

    return (
        <td
            ref={tdRef}
            class={styles.cell}
            role="gridcell"
            tabindex={props.selection.targetKey() === key() ? 0 : -1}
            aria-selected={selected()}
            classList={{ [styles.selected]: selected() }}
            onFocus={() => props.selection.select(key())}
            onMouseDown={(evt) => {
                // Focus explicitly: not all browsers focus a tabindex ancestor
                // on click, and -1 cells are skipped by default clicks.
                evt.currentTarget.focus();
            }}
            onKeyDown={(evt) => onCellKeyDown(props.selection, key(), evt)}
        >
            <Cell field={props.field} header={props.header} tables={props.tables} />
        </td>
    );
}
