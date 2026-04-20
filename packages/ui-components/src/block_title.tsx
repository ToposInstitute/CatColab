import { type JSX, Show } from "solid-js";

import { SettingsDisclosure } from "./settings_disclosure";

import styles from "./block_title.module.css";
import "./panel.css";

/** A component with a title bar and optional settings pane.

This component is a styled wrapper around `SettingsDisclosure`.
 */
export function BlockTitle(props: {
    /** Title for the component, shown next to the fold/expand button. */
    title: string | JSX.Element;
    /** Additional action content. */
    actions?: JSX.Element;
    /** Settings pane that can be expanded or folded. */
    settingsPane?: JSX.Element;
}) {
    return (
        <SettingsDisclosure settingsPane={props.settingsPane}>
            {(trigger) => (
                <div class={styles.wrapper}>
                    <div class="block-title-header panel-header">
                        <span class="title">{props.title}</span>
                        <span class="filler" />
                        <Show when={props.actions}>{props.actions}</Show>
                        {trigger}
                    </div>
                </div>
            )}
        </SettingsDisclosure>
    );
}
