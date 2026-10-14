import { createEffect } from "solid-js";

import type { FieldValue, InstanceTable, TableHeader, TableRow } from "catcolab-documents";
import { Cell } from "./cell";
import { useGridCellFocus } from "./grid_focus";
import { makeCellKey } from "./navigation";

import styles from "./table_editor.module.css";

export function GridCell(props: {
    row: TableRow;
    header: TableHeader;
    field: FieldValue | undefined;
    tables: ReadonlyArray<InstanceTable>;
}) {
    const key = () => makeCellKey(props.header.id, props.row.id);
    const { selected, tabindex, focus } = useGridCellFocus(key);

    let tdRef!: HTMLTableCellElement;

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
            tabindex={tabindex()}
            aria-selected={selected()}
            classList={{ [styles.selected]: selected() }}
            onFocus={() => focus.setFocused(true)}
            onMouseDown={(evt) => {
                // Some browsers do not focus the containing cell on click.
                evt.currentTarget.focus();
            }}
        >
            <Cell field={props.field} header={props.header} tables={props.tables} />
        </td>
    );
}
