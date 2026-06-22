import Disclosure from "@corvu/disclosure";
import SettingsIcon from "lucide-solid/icons/settings";
import { createSignal, type JSX, Show } from "solid-js";

import styles from "./settings_disclosure.module.css";

/** A disclosure component with a gear icon trigger and an animated settings pane.

The consumer places the trigger via a render prop, allowing it to be positioned
anywhere in the layout. The settings content expands below.
 */
export function SettingsDisclosure(props: {
    /** Settings pane that expands when the gear icon is clicked. */
    settingsPane?: JSX.Element;
    /** Size of the gear icon in pixels (default: 16). */
    iconSize?: number;
    /** Render prop receiving the gear icon trigger element (or undefined if no settings). */
    children: (trigger: JSX.Element | undefined) => JSX.Element;
}) {
    const [isExpanded, setIsExpanded] = createSignal(false);

    const trigger = () =>
        props.settingsPane ? (
            <Disclosure.Trigger class={styles.trigger}>
                <SettingsIcon size={props.iconSize ?? 16} />
            </Disclosure.Trigger>
        ) : undefined;

    return (
        <Disclosure
            expanded={isExpanded()}
            onExpandedChange={setIsExpanded}
            collapseBehavior="hide"
        >
            {props.children(trigger())}
            <Show when={props.settingsPane}>
                <Disclosure.Content>
                    <div class={styles.settingsPane}>{props.settingsPane}</div>
                </Disclosure.Content>
            </Show>
        </Disclosure>
    );
}
