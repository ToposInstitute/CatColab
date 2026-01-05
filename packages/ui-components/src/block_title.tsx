import Disclosure from "@corvu/disclosure";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Settings from "lucide-solid/icons/settings";
import { createSignal, type JSX, Show } from "solid-js";

import styles from "./block_title.module.css";
import "./panel.css";

/** A component with a title bar and optional settings pane.

This component is a styled wrapper around corvu's `Disclosure`.
 */
export function BlockTitle(props: {
    /** Title for the component, shown next to the fold/expand button. */
    title: string | JSX.Element;
    /** Additional action content. */
    actions?: JSX.Element;
    /** Settings pane that can be expanded or folded. */
    settingsPane?: JSX.Element;
}) {
    const [isExpanded, setIsExpanded] = createSignal(false);

    // NOTE: Set the collapse behavior to "hide" to get a smooth animation.
    return (
        <Disclosure
            expanded={isExpanded()}
            onExpandedChange={setIsExpanded}
            collapseBehavior="hide"
        >
            <div class={styles.wrapper}>
                <div class="block-title-header panel-header">
                    <Show when={props.title}>
                        <span class="title">{props.title}</span>
                    </Show>
                    <Show when={props.actions}>
                        <span class="filler" />
                        {props.actions}
                    </Show>
                </div>
                <Show when={props.settingsPane}>
                    <Disclosure.Trigger class={styles.trigger}>
                        <Settings size={14} />
                        <Show when={isExpanded()} fallback={<ChevronRight size={14} />}>
                            <ChevronDown size={14} />
                        </Show>
                    </Disclosure.Trigger>
                </Show>
            </div>
            <Show when={props.settingsPane}>
                <Disclosure.Content>{props.settingsPane}</Disclosure.Content>
            </Show>
        </Disclosure>
    );
}
