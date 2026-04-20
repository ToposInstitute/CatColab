import { createSignal, For, type JSX, Show } from "solid-js";

import styles from "./expandable_list.module.css";

export function ExpandableList(props: {
    /** Array of items to display */
    items: (string | JSX.Element)[];
    /** Number of items to show before truncation. Defaults to 3. */
    threshold?: number;
    /** Function to render each item */
    renderItem?: (item: string | JSX.Element, index: number) => JSX.Element;
    /** Custom text for the expand button. Defaults to "N more..." */
    expandText?: (remainingCount: number) => string;
    /** Custom text for the collapse button. Defaults to "Show less" */
    collapseText?: string;
    /** Optional title that can be clicked to toggle expansion */
    title?: string | JSX.Element;
}) {
    const [isExpanded, setIsExpanded] = createSignal(false);
    const threshold = () => props.threshold ?? 3;

    const visibleItems = () => {
        if (isExpanded() || props.items.length <= threshold()) {
            return props.items;
        }
        return props.items.slice(0, threshold());
    };

    const remainingCount = () => Math.max(0, props.items.length - threshold());

    const expandText = () => {
        if (props.expandText) {
            return props.expandText(remainingCount());
        }
        return `${remainingCount()} more...`;
    };

    const collapseText = () => props.collapseText ?? "Show less";

    const toggleExpanded = () => {
        if (props.items.length > threshold()) {
            setIsExpanded(!isExpanded());
        }
    };

    return (
        <div class={styles.expandableList}>
            <Show when={props.title}>
                <div
                    class={props.items.length > threshold() ? styles.expandableListTitle : ""}
                    onClick={toggleExpanded}
                >
                    {props.title}
                </div>
            </Show>
            <ul class={styles.expandableListItems}>
                <For each={visibleItems()}>
                    {(item, index) =>
                        props.renderItem ? (
                            <li>{props.renderItem(item, index())}</li>
                        ) : (
                            <li>{item}</li>
                        )
                    }
                </For>
            </ul>
            <Show when={props.items.length > threshold()}>
                <button type="button" class={styles.expandableListToggle} onClick={toggleExpanded}>
                    {isExpanded() ? collapseText() : expandText()}
                </button>
            </Show>
        </div>
    );
}
