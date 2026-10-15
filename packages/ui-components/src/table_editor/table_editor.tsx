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
import { createIssueIndex } from "./validation";

import styles from "./table_editor.module.css";

export type TableEditorProps = {
    /** The table to display and edit. */
    table: InstanceTable;

    /** All tables in the instance, including this one.

    Used to resolve the rows referenced by `RowRef` columns.
     */
    allTables: ReadonlyArray<InstanceTable>;

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
    const issuesAt = createIssueIndex(() => props.issues ?? []);
    return (
        <section
            class={`${styles.table}${props.class ? ` ${props.class}` : ""}`}
            classList={{ [styles.unknown]: props.table.label === null }}
            title={
                issuesAt([props.table.id])
                    .map((issue) => issue.message)
                    .join("\n") || undefined
            }
        >
            <TitleBar
                table={props.table}
                onHide={props.onHide}
                onDeleteOrphanedTable={props.onDeleteOrphanedTable}
            />
            <TableGrid
                focus={props.focus}
                table={props.table}
                allTables={props.allTables}
                onSetField={props.onSetField}
                onAddRow={props.onAddRow}
                onDeleteRow={props.onDeleteRow}
                issuesAt={issuesAt}
                onDeleteOrphanedColumn={props.onDeleteOrphanedColumn}
            />
        </section>
    );
}
