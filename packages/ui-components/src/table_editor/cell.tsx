import { Show } from "solid-js";

import type { FieldValue, InstanceTable, TableHeader } from "catcolab-documents";
import { fieldText } from "./display";

import styles from "./table_editor.module.css";

/** The read-only content of a cell: text, or a checkbox for a boolean column. */
export function Cell(props: {
    field: FieldValue | undefined;
    header: TableHeader;
    tables: ReadonlyArray<InstanceTable>;
}) {
    return (
        <Show
            when={props.header.type.tag === "Bool"}
            fallback={
                <span class={styles.cellText}>
                    {fieldText(props.field, props.header, props.tables)}
                </span>
            }
        >
            <input
                type="checkbox"
                class={styles.checkbox}
                checked={props.field?.tag === "Bool" && props.field.content.value}
                tabindex={-1}
                disabled
            />
        </Show>
    );
}
