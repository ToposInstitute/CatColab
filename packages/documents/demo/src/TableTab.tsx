import ChevronRight from "lucide-solid/icons/chevron-right";
import GripVertical from "lucide-solid/icons/grip-vertical";

import type { ObjectCell } from "catcolab-documents";

import styles from "./TableTab.module.css";

/**
 * A tab in the left rail standing for one entity's instance table. Tabs are
 * always shown, one per table, and never move out of the rail. A tab is
 * highlighted while its table is expanded (its full grid shown on the right).
 * Clicking the tab always expands the table and raises its grid to the top.
 */
export function TableTab(props: {
    entity: ObjectCell;
    expanded: boolean;
    rowCount: number;
    onSelect: () => void;
    dragHandleRef: (element: HTMLButtonElement) => void;
}) {
    return (
        <div class={styles.tab} classList={{ [styles.expanded ?? ""]: props.expanded }}>
            <button
                ref={props.dragHandleRef}
                class={styles.dragHandle}
                data-table-drag-handle
                type="button"
                aria-label={`Drag ${props.entity.label || "Unnamed"} table`}
                title="Drag to reorder table"
            >
                <GripVertical size={16} />
            </button>
            <button
                class={styles.toggle}
                type="button"
                aria-pressed={props.expanded}
                aria-label={`Open ${props.entity.label || "Unnamed"} table`}
                title="Open table"
                onClick={() => props.onSelect()}
            >
                <span
                    classList={{
                        [styles.entityName ?? ""]: true,
                        [styles.unnamed ?? ""]: !props.entity.label,
                    }}
                >
                    {props.entity.label || "Unnamed"}
                </span>
                <span class={styles.count}>{props.rowCount}</span>
                <span class={styles.chevron}>
                    <ChevronRight size={16} />
                </span>
            </button>
        </div>
    );
}
