import { createEffect, createMemo, on, Show, useContext } from "solid-js";

import type { FieldValue, InstanceTable, TableHeader, TableRow } from "catcolab-documents";
import type { FocusHandle } from "../util/focus";
import { Cell } from "./cell";
import { CellEditor } from "./cell_editor";
import { codomainOf, defaultRowLabel } from "./display";
import { parseValue } from "./editing";
import { useGridController } from "./grid_controller";
import { makeCellKey } from "./navigation";
import { issueMessage, type IssueLookup } from "./validation";
import { ViewportContext } from "./viewport";

import styles from "./table_editor.module.css";

/** The "outer box" of the cell. This is the container for the [`CellEditor`].
 * It handles highlighting and connects clicks to the grid controller. */
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
    const viewport = useContext(ViewportContext);
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
            onComplete: () => edit.commitRowRef(key(), target),
        }));
    });

    let tdRef!: HTMLTableCellElement;

    // Reveal mounted selections without moving browser focus off the grid.
    createEffect(
        on([selected, key, () => viewport?.parked()], ([isSelected]) => {
            if (isSelected && !viewport?.parked()) {
                viewport?.revealCell(tdRef);
            }
        }),
    );

    return (
        <td
            ref={tdRef}
            id={edit.cellId(key())}
            class={styles.cell}
            role="gridcell"
            aria-selected={selected()}
            aria-invalid={invalid()}
            aria-readonly={props.header.type.tag === "Unknown"}
            title={issues().map(issueMessage).join("\n") || undefined}
            classList={{
                [styles.selected]: selected(),
                [styles.invalid]: invalid(),
                [styles.columnDeleting]: props.deleting,
            }}
            onFocus={() => edit.selectFromPointer(key())}
            onMouseDown={(evt) => {
                // Keep real focus on the grid, except in the active editor.
                // Prevent native checkbox focus without preventing its click toggle.
                if (!editing()) {
                    evt.preventDefault();
                    edit.selectFromPointer(key());
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
                    onCommit={edit.commitEdit}
                    onCancel={edit.cancelEdit}
                />
            </Show>
        </td>
    );
}
