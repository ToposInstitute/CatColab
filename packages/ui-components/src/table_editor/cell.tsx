import { Show } from "solid-js";

import type { FieldValue, InstanceTable, TableHeader } from "catcolab-documents";
import { fieldText } from "./display";

import styles from "./table_editor.module.css";

/** The read-only content of a cell: text, or a checkbox for a boolean column. */
export function Cell(props: {
    field: FieldValue | undefined;
    header: TableHeader;
    tables: ReadonlyArray<InstanceTable>;
    onToggle?: () => void;
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
                // Boolean cells toggle only when the checkbox itself is
                // clicked; clicking elsewhere in the cell just selects it. The
                // native toggle is deliberately not prevented: reverting it
                // would fight with the reactively controlled `checked`
                // property, which instead confirms the toggle when the new
                // value flows back in.
                onClick={() => props.onToggle?.()}
            />
        </Show>
    );
}
