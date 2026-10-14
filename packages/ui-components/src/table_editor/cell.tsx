import ChevronDownIcon from "lucide-solid/icons/chevron-down";
import { Show } from "solid-js";

import type { FieldValue, InstanceTable, TableHeader } from "catcolab-documents";
import { fieldText } from "./display";

import styles from "./table_editor.module.css";

/** The read-only content of a cell: text, a checkbox for a boolean column, or
a labeled reference with a completion indicator for a row-reference column. */
export function Cell(props: {
    field: FieldValue | undefined;
    header: TableHeader;
    tables: ReadonlyArray<InstanceTable>;
    onToggle?: () => void;
    onOpenRowRef?: () => void;
}) {
    const text = () => fieldText(props.field, props.header, props.tables);
    return (
        <Show
            when={props.header.type.tag === "Bool"}
            fallback={
                <Show
                    when={props.header.type.tag === "RowRef"}
                    fallback={<span class={styles.cellText}>{text()}</span>}
                >
                    <span class={styles.rowRefContent}>
                        <span class={styles.cellText}>{text()}</span>
                        <button
                            type="button"
                            class={styles.rowRefIndicator}
                            aria-label="Choose a value"
                            tabindex={-1}
                            onMouseDown={(evt) => {
                                evt.preventDefault();
                                evt.stopPropagation();
                            }}
                            onClick={(evt) => {
                                evt.stopPropagation();
                                props.onOpenRowRef?.();
                            }}
                        >
                            <ChevronDownIcon size={14} aria-hidden="true" />
                        </button>
                    </span>
                </Show>
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
