import { type JSX, Show } from "solid-js";

import {
    Handsontable as HandsontableGrid,
    type HandsontableInstance,
    type HandsontableSettings,
} from "./handsontable";
import Handsontable from "./handsontable_core.js";

import styles from "./table_editor.module.css";

const DEFAULT_COLUMN_WIDTH = 50;
const DELETE_COLUMN_WIDTH = 40;
const ROW_HEIGHT = 28;
const COLUMN_HEADER_HEIGHT = 28;

export type TableEditorColumnSettings = Omit<Handsontable.GridSettings, "width"> & {
    width?: number;
};

export type TableEditorSettings = Omit<
    HandsontableSettings,
    | "width"
    | "height"
    | "rowHeaders"
    | "rowHeaderWidth"
    | "columns"
    | "colHeaders"
    | "colWidths"
    | "data"
> & {
    columns: TableEditorColumnSettings[];
    colHeaders?: string[];
    colWidths?: number[];
    data: unknown[];
};
export type TableEditorInstance = HandsontableInstance;

export type TableEditorProps = {
    /** Handsontable settings extended with row editing controls. */
    settings: TableEditorSettings;
    /** Label shown above the grid. */
    label?: JSX.Element;
    class?: string;
    /** Called after the Handsontable instance is created. */
    onReady?: (instance: TableEditorInstance) => void;
};

/** A spreadsheet-esque table editor with controls for adding and deleting rows. */
export function TableEditor(props: TableEditorProps) {
    let table: TableEditorInstance | undefined;

    const deleteRowRenderer = (instance: Handsontable, td: HTMLElement, row: number) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = styles.deleteRow!;
        button.title = "Delete row";
        button.setAttribute("aria-label", "Delete row");
        button.textContent = "×";
        button.addEventListener("mousedown", (event) => event.stopPropagation());
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            instance.alter("remove_row", row);
        });
        td.classList.add(styles.deleteCell!);
        td.replaceChildren(button);
        return td;
    };

    const deleteColumn: TableEditorColumnSettings = {
        data: "__tableEditorDelete",
        width: DELETE_COLUMN_WIDTH,
        readOnly: true,
        copyable: false,
        renderer: deleteRowRenderer,
    };

    const settings = () => {
        const baseSettings = props.settings;
        const editable = !baseSettings.readOnly;

        let columns = baseSettings.columns;
        if (editable) {
            columns = [...columns, deleteColumn];
        }

        let colHeaders = baseSettings.colHeaders;
        if (colHeaders && editable) {
            colHeaders = [...colHeaders, " "];
        }

        const width = columns.reduce((total, column, index) => {
            const configuredWidth = baseSettings.colWidths?.[index];
            const columnWidth = column.width ?? configuredWidth ?? DEFAULT_COLUMN_WIDTH;
            return total + columnWidth;
        }, 0);

        return {
            ...baseSettings,
            columns,
            colHeaders,
            rowHeaders: false,
            width,
            height: tableHeight(baseSettings.data.length),
            rowHeights: ROW_HEIGHT,
            columnHeaderHeight: COLUMN_HEADER_HEIGHT,
            wordWrap: false,
            stretchH: "none",
        };
    };

    const onReady = (instance: TableEditorInstance) => {
        table = instance;
        const fitHeight = () => {
            instance.updateSettings({ height: tableHeight(instance.countRows()) }, false);
        };
        instance.addHook("afterCreateRow", fitHeight);
        instance.addHook("afterRemoveRow", fitHeight);
        fitHeight();
        props.onReady?.(instance);
    };

    const addRow = () => table?.alter("insert_row", table.countRows());

    return (
        <section class={`${styles.table}${props.class ? ` ${props.class}` : ""}`}>
            <Show when={props.label !== undefined}>
                <div class={styles.header}>
                    <h3 class={styles.label}>{props.label}</h3>
                </div>
            </Show>
            <HandsontableGrid settings={settings()} onReady={onReady} />
            <Show when={!props.settings.readOnly}>
                <div class={styles.footer}>
                    <button class={styles.addRow} type="button" onClick={addRow}>
                        + Row
                    </button>
                </div>
            </Show>
        </section>
    );
}

function tableHeight(rowCount: number): number {
    // Allow for Walkontable's top border.
    return COLUMN_HEADER_HEIGHT + rowCount * ROW_HEIGHT + 1.95;
}
