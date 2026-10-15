import MinusIcon from "lucide-solid/icons/minus";
import { Show } from "solid-js";

import type { InstanceTable } from "catcolab-documents";
import { Button } from "../button";
import { IconButton } from "../icon_button";
import { tableDisplayName } from "./display";

import styles from "./table_editor.module.css";

/** The title bar above the grid: the table name and its controls. */
export function TitleBar(props: {
    table: InstanceTable;
    onHide?: () => void;
    onDeleteOrphanedTable?: () => void;
}) {
    return (
        <div class={styles.header}>
            <h3 class={styles.label} classList={{ [styles.unnamed]: !props.table.label }}>
                {tableDisplayName(props.table)}
            </h3>
            <Show when={props.table.label === null && props.onDeleteOrphanedTable}>
                <Button
                    variant="danger"
                    outline
                    class={styles.deleteTable}
                    aria-label="Delete table"
                    onMouseDown={(evt) => evt.preventDefault()}
                    onClick={() => props.onDeleteOrphanedTable?.()}
                >
                    Delete
                </Button>
            </Show>
            <Show when={props.onHide}>
                {(onHide) => (
                    <IconButton
                        type="button"
                        aria-label="Hide table"
                        tooltip="Hide table"
                        onClick={() => onHide()()}
                    >
                        <MinusIcon size={16} />
                    </IconButton>
                )}
            </Show>
        </div>
    );
}
