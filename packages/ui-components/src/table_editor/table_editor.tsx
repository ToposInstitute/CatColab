import { Show } from "solid-js";

import type {
    InstanceTable,
    LiteralValue,
    TableHeader,
    TableIssue,
    TableRow,
} from "catcolab-documents";
import type { FocusHandle } from "../util/focus";
import { TableGrid } from "./grid";
import { TitleBar } from "./title_bar";

import styles from "./table_editor.module.css";

export type TableEditorProps = {
    /** The table to display and edit. */
    table: InstanceTable;

    /** All tables in the instance, including this one.

    Used to resolve the rows referenced by `RowRef` columns.
     */
    tables: ReadonlyArray<InstanceTable>;

    /** Validation issues for this table and its fields, matched by `path`. */
    issues?: ReadonlyArray<TableIssue>;

    class?: string;

    /** Focus state used to compose this editor into a larger focus tree. */
    focus: FocusHandle;

    /** Called when the user edits a cell.

    A `TableRow` value sets a row reference; `null` clears the field.
     */
    onSetField: (row: TableRow, header: TableHeader, value: LiteralValue | TableRow) => void;

    /** Called when the user adds a row. */
    onAddRow: () => void;

    /** Called when the user deletes a row. */
    onDeleteRow: (row: TableRow) => void;

    /** Called when the user hides the table. Shows a hide button if provided. */
    onHide?: () => void;

    /** Called when the user deletes this table, which is offered only when the
    table has no entity in the schema. */
    onDeleteOrphanedTable?: () => void;

    /** Called when the user deletes a column that has no morphism in the schema. */
    onDeleteOrphanedColumn?: (header: TableHeader) => void;
};

/** A spreadsheet-like editor for a tabular data instance. */
export function TableEditor(props: TableEditorProps) {
    return (
        <section
            class={`${styles.table}${props.class ? ` ${props.class}` : ""}`}
            classList={{ [styles.unknown]: props.table.label === null }}
        >
            <TitleBar table={props.table} onHide={props.onHide} />
            <div class={styles.scrollViewport}>
                <TableGrid
                    focus={props.focus}
                    table={props.table}
                    tables={props.tables}
                    onSetField={props.onSetField}
                />
            </div>
            <Show when={props.table.label !== null}>
                <div class={styles.footer}>
                    <button class={styles.addRow} type="button" onClick={() => props.onAddRow()}>
                        + Row
                    </button>
                </div>
            </Show>
        </section>
    );
}
