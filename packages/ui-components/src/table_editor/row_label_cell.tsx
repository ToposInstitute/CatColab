import { createEffect, createMemo, on, Show, useContext } from "solid-js";

import type { TableIssue, TableRow } from "catcolab-documents";
import type { FocusHandle } from "../util/focus";
import { CellEditor } from "./cell_editor";
import { rowDisplayLabel } from "./display";
import { useGridController } from "./grid_controller";
import { makeCellKey } from "./navigation";
import { RowIssueTooltip } from "./row_issue_tooltip";
import { issueMessage } from "./validation";
import { ViewportContext } from "./viewport";

import styles from "./table_editor.module.css";

export function RowLabelCell(props: { row: TableRow; issues: ReadonlyArray<TableIssue> }) {
    const key = createMemo(() => makeCellKey(null, props.row.id));
    const edit = useGridController();
    const selected = createMemo(() => edit.activeKey() === key());
    const editing = () => edit.isEditing(key());
    const focus: FocusHandle = {
        hasFocus: () => edit.cellFocus(key()).hasFocus(),
        setFocused: (focused) => edit.cellFocus(key()).setFocused(focused),
    };
    const viewport = useContext(ViewportContext);
    let cell!: HTMLTableCellElement;

    createEffect(
        on([selected, key, () => viewport?.parked()], ([isSelected]) => {
            if (isSelected && !viewport?.parked()) {
                viewport?.revealCell(cell);
            }
        }),
    );

    return (
        <RowIssueTooltip
            ref={cell}
            issues={props.issues}
            id={edit.cellId(key())}
            class={`${styles.cell} ${styles.rowLabel}`}
            classList={{
                [styles.selected]: selected(),
                [styles.automaticLabel]: !props.row.label,
            }}
            aria-colindex={1}
            aria-selected={selected()}
            aria-invalid={props.issues.length > 0}
            aria-label={`Row ${props.row.index + 1} label: ${rowDisplayLabel(props.row)}`}
            aria-description={[
                !props.row.label
                    ? "Automatic row number. Enter a label to override it."
                    : "Clear the label to use the automatic row number.",
                ...props.issues.map(issueMessage),
            ].join(" ")}
            title={rowDisplayLabel(props.row)}
            onFocus={() => edit.selectFromPointer(key())}
            onMouseDown={(evt) => {
                if (!editing()) {
                    evt.preventDefault();
                    edit.selectFromPointer(key());
                }
            }}
            onDblClick={() => edit.startEdit(key())}
        >
            <span class={styles.cellText}>{rowDisplayLabel(props.row)}</span>
            <Show when={editing()}>
                <CellEditor
                    focus={focus}
                    text={edit.editText()}
                    ariaLabel={`Row ${props.row.index + 1} label`}
                    setText={edit.setEditText}
                    validate={() => true}
                    commitOnBlur
                    onCommit={edit.commitEdit}
                    onCancel={edit.cancelEdit}
                />
            </Show>
        </RowIssueTooltip>
    );
}
