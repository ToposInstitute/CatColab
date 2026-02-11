import Disclosure from "@corvu/disclosure";
import SettingsIcon from "lucide-solid/icons/settings";
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

    return (
        <Disclosure
            expanded={isExpanded()}
            onExpandedChange={setIsExpanded}
            collapseBehavior="hide"
        >
            <div class={styles.wrapper}>
                <div class="block-title-header panel-header">
                    <span class="title">{props.title}</span>
                    <span class="filler" />
                    <Show when={props.actions}>{props.actions}</Show>
                    <Show when={props.settingsPane}>
                        <Disclosure.Trigger class={styles.trigger}>
                            <SettingsIcon size={16} />
                        </Disclosure.Trigger>
                    </Show>
                </div>
            </div>
            <Show when={props.settingsPane}>
                <Disclosure.Content>
                    <div class={styles.settingsPane}>{props.settingsPane}</div>
                </Disclosure.Content>
            </Show>
        </Disclosure>
    );
}
