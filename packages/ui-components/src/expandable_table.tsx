import { createSignal, For, type JSX, Show } from "solid-js";

import styles from "./expandable_table.module.css";

export function ExpandableTable<T>(props: {
    /** Array of row data to display */
    rows: T[];
    /** Column definitions */
    columns: {
        header?: string | JSX.Element;
        cell: (row: T, index: number) => JSX.Element;
    }[];
    /** Number of rows to show before truncation. Defaults to 3. */
    threshold?: number;
    /** Custom text for the expand button. Defaults to "N more rows..." */
    expandText?: (remainingCount: number) => string;
    /** Custom text for the collapse button. Defaults to "Show less" */
    collapseText?: string;
    /** Optional title that can be clicked to toggle expansion */
    title?: string | JSX.Element;
}) {
    const [isExpanded, setIsExpanded] = createSignal(false);
    const threshold = () => props.threshold ?? 3;

    const visibleRows = () => {
        if (isExpanded() || props.rows.length <= threshold()) {
            return props.rows;
        }
        return props.rows.slice(0, threshold());
    };

    const remainingCount = () => Math.max(0, props.rows.length - threshold());

    const expandText = () => {
        if (props.expandText) {
            return props.expandText(remainingCount());
        }
        return `${remainingCount()} more ...`;
    };

    const collapseText = () => props.collapseText ?? "Show less";

    const toggleExpanded = () => {
        if (props.rows.length > threshold()) {
            setIsExpanded(!isExpanded());
        }
    };

    return (
        <div class={styles.expandableTable}>
            <Show when={props.title}>
                <div
                    class={props.rows.length > threshold() ? styles.expandableTableTitle : ""}
                    onClick={toggleExpanded}
                >
                    {props.title}
                </div>
            </Show>
            <table class={styles.expandableTableTable}>
                <thead>
                    <tr>
                        <For each={props.columns}>{(column) => <th>{column.header}</th>}</For>
                    </tr>
                </thead>
                <tbody>
                    <For each={visibleRows()}>
                        {(row, index) => (
                            <tr>
                                <For each={props.columns}>
                                    {(column) => <td>{column.cell(row, index())}</td>}
                                </For>
                            </tr>
                        )}
                    </For>
                </tbody>
            </table>
            <Show when={props.rows.length > threshold()}>
                <button type="button" class={styles.expandableTableToggle} onClick={toggleExpanded}>
                    {isExpanded() ? collapseText() : expandText()}
                </button>
            </Show>
        </div>
    );
}
