import { createEffect, Show } from "solid-js";

import type { FieldValue, InstanceTable, TableHeader, TableRow } from "catcolab-documents";
import { Cell } from "./cell";
import { CellEditor } from "./cell_editor";
import { useCellEdit } from "./edit";
import { parseValue } from "./editing";
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
    const edit = useCellEdit();
    const editing = () => edit.isEditing(key());

    let tdRef!: HTMLTableCellElement;

    // Keep DOM focus on the selected cell.
    createEffect(() => {
        if (selected() && !edit.isSuppressed(key()) && document.activeElement !== tdRef) {
            tdRef.focus({ preventScroll: true });
        }
    });

    // Regain focus when the editor closes without moving the selection, as on
    // Escape. A commit from a blurred editor suppresses this: focus has
    // already moved elsewhere.
    createEffect(() => {
        if (
            !editing() &&
            selected() &&
            !edit.isSuppressed(key()) &&
            document.activeElement === document.body
        ) {
            tdRef.focus({ preventScroll: true });
        }
    });

    return (
        <td
            ref={tdRef}
            class={styles.cell}
            role="gridcell"
            tabindex={editing() ? -1 : tabindex()}
            aria-selected={selected()}
            classList={{ [styles.selected]: selected() }}
            onFocus={() => focus.setFocused(true)}
            onMouseDown={(evt) => {
                // Some browsers do not focus the containing cell on click, and
                // focusing must not steal focus from an open editor.
                if (!editing()) {
                    evt.currentTarget.focus();
                }
            }}
            onDblClick={() => {
                if (props.header.type.tag === "Bool") {
                    edit.toggleBool(key());
                } else {
                    edit.startEdit(key());
                }
            }}
        >
            <Show
                when={editing()}
                fallback={
                    <Cell
                        field={props.field}
                        header={props.header}
                        tables={props.tables}
                        onToggle={() => edit.toggleBool(key())}
                    />
                }
            >
                <CellEditor
                    focus={focus}
                    text={edit.editText()}
                    setText={edit.setEditText}
                    validate={(text) => parseValue(props.header, text).ok}
                    canExitBackward={!edit.isFirstCell(key())}
                    onCommit={(dir) => edit.commitEdit(dir)}
                    onCancel={edit.cancelEdit}
                />
            </Show>
        </td>
    );
}
