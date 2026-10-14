import { Show } from "solid-js";

import type { TableHeader } from "catcolab-documents";

import styles from "./table_editor.module.css";

/** Header cell for a single column. */
export function ColumnHeader(props: { header: TableHeader }) {
    return (
        <div class={styles.columnContent}>
            <span class={styles.columnLabel}>
                <Show
                    when={props.header.label}
                    fallback={
                        <span class={styles.unnamed}>
                            {props.header.label === null ? "Unknown column" : "Unnamed column"}
                        </span>
                    }
                >
                    {props.header.label}
                </Show>
            </span>
        </div>
    );
}
