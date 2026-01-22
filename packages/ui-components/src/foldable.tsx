import Discloure from "@corvu/disclosure";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import { createSignal, type JSX, Show } from "solid-js";

import "./panel.css";

import styles from "./foldable.module.css";

/** A component whose contents can be expanded or folded.

This component is a styled wrapper around corvu's `Disclosure`.
 */
export function Foldable(props: {
    /** Title for the component, shown next to the fold/expand button. */
    title?: string | JSX.Element;
    /** Additional header content. */
    header?: JSX.Element;
    /** Content that is expanded or folded. */
    children: JSX.Element;
}) {
    const [isExpanded, setIsExpanded] = createSignal(false);

    return (
        <Discloure expanded={isExpanded()} onExpandedChange={setIsExpanded} collapseBehavior="hide">
            <div class="foldable-header panel-header">
                <Discloure.Trigger class={styles.trigger}>
                    <Show when={isExpanded()} fallback={<ChevronRight />}>
                        <ChevronDown />
                    </Show>
                    <Show when={props.title}>
                        <span class="title">{props.title}</span>
                    </Show>
                </Discloure.Trigger>
                <Show when={props.header}>
                    <span class="filler" />
                    {props.header}
                </Show>
            </div>
            <Discloure.Content class={styles.content}>{props.children}</Discloure.Content>
        </Discloure>
    );
}
