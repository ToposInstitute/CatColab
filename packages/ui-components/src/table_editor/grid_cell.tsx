import { createEffect, createMemo, on, Show } from "solid-js";

import type { FieldValue, InstanceTable, TableHeader, TableRow } from "catcolab-documents";
import type { FocusHandle } from "../util/focus";
import { Cell } from "./cell";
import { CellEditor } from "./cell_editor";
import { codomainOf, defaultRowLabel } from "./display";
import { parseValue } from "./editing";
import { useGridController } from "./grid_controller";
import { makeCellKey } from "./navigation";
import { issueMessage, type IssueLookup } from "./validation";

import styles from "./table_editor.module.css";

export function GridCell(props: {
    issuesAt: IssueLookup;
    deleting: boolean;
    row: TableRow;
    header: TableHeader;
    field: FieldValue | undefined;
    allTables: ReadonlyArray<InstanceTable>;
}) {
    const key = createMemo(() => makeCellKey(props.header.id, props.row.id));
    const edit = useGridController();
    const selected = createMemo(() => edit.activeKey() === key());
    // Resolve lazily because Index slots can acquire different cell IDs.
    const focus: FocusHandle = {
        hasFocus: () => edit.cellFocus(key()).hasFocus(),
        setFocused: (focused) => edit.cellFocus(key()).setFocused(focused),
    };
    const editing = () => edit.isEditing(key());
    const issues = () => (props.field ? props.issuesAt(props.field.content.path) : []);
    const invalid = () => issues().length > 0;

    /** Possible values for a row-reference cell, with the current value
    highlighted. The target is committed by the completion itself. */
    const completions = createMemo(() => {
        if (props.header.type.tag !== "RowRef") {
            return undefined;
        }
        const codomain = codomainOf(props.header, props.allTables);
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
            tabindex={editing() ? -1 : 0}
            aria-selected={selected()}
            aria-invalid={invalid()}
            aria-readonly={props.header.type.tag === "Unknown"}
            title={issues().map(issueMessage).join("\n") || undefined}
            classList={{
                [styles.selected]: selected(),
                [styles.invalid]: invalid(),
                [styles.columnDeleting]: props.deleting,
            }}
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
                        allTables={props.allTables}
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
                    onCommit={(dir) => edit.commitEdit(dir, tdRef)}
                    onCancel={() => edit.cancelEdit(tdRef)}
                />
            </Show>
        </td>
    );
}
