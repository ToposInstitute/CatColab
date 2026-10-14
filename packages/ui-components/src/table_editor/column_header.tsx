import { Show } from "solid-js";

import type { TableHeader } from "catcolab-documents";
import { Button } from "../button";

import styles from "./table_editor.module.css";

/** Header cell for a single column. */
export function ColumnHeader(props: {
    header: TableHeader;
    onDelete?: (header: TableHeader) => void;
    onDeleting: (headerId: string | null) => void;
}) {
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
            <Show when={props.onDelete}>
                <Button
                    variant="danger"
                    outline
                    class={styles.deleteColumn}
                    aria-label="Delete column"
                    tabindex={-1}
                    onMouseDown={(evt) => evt.preventDefault()}
                    onMouseEnter={() => props.onDeleting(props.header.id)}
                    onMouseLeave={() => props.onDeleting(null)}
                    onClick={() => {
                        props.onDeleting(null);
                        props.onDelete?.(props.header);
                    }}
                >
                    Delete
                </Button>
            </Show>
        </div>
    );
}
