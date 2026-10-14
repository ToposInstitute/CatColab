import { createEffect, createMemo, on, Show } from "solid-js";

import type { FieldValue, InstanceTable, TableHeader, TableRow } from "catcolab-documents";
import { Cell } from "./cell";
import { CellEditor } from "./cell_editor";
import { codomainOf, defaultRowLabel } from "./display";
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
    const key = createMemo(() => makeCellKey(props.header.id, props.row.id));
    const { selected, tabindex, focus } = useGridCellFocus(() => key());
    const edit = useCellEdit();
    const editing = () => edit.isEditing(key());

    /** Possible values for a row-reference cell, with the current value
    highlighted. The target is committed by the completion itself. */
    const completions = createMemo(() => {
        if (props.header.type.tag !== "RowRef") {
            return undefined;
        }
        const codomain = codomainOf(props.header, props.tables);
        if (!codomain) {
            return [];
        }
        const currentId = props.field?.tag === "RowRef" ? props.field.content.id : undefined;
        return codomain.rows.map((target) => ({
            name: defaultRowLabel(codomain, target),
            selected: target.id === currentId,
            onComplete: () => edit.commitRowRef(key(), target, tdRef),
        }));
    });

    let tdRef!: HTMLTableCellElement;

    // Move browser focus when this cell becomes selected. The editing check
    // is untracked: closing an editor or updating a field must not move focus.
    // TextInput owns browser focus while editing.
    createEffect(
        on([selected, key], ([isSelected]) => {
            if (isSelected && !editing() && document.activeElement !== tdRef) {
                tdRef.focus({ preventScroll: true });
            }
        }),
    );

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
                        onOpenRowRef={() => edit.startEdit(key())}
                    />
                }
            >
                <CellEditor
                    focus={focus}
                    text={edit.editText()}
                    setText={edit.setEditText}
                    validate={(text) =>
                        props.header.type.tag === "RowRef" || parseValue(props.header, text).ok
                    }
                    completions={completions()}
                    readOnly={props.header.type.tag === "RowRef"}
                    canExitBackward={!edit.isFirstCell(key())}
                    onCommit={(dir) => edit.commitEdit(dir, tdRef)}
                    onCancel={() => edit.cancelEdit(tdRef)}
                />
            </Show>
        </td>
    );
}
