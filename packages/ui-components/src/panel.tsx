import { type JSX, Show } from "solid-js";

import "./panel.css";

/** Header for a panel with a title.
 */
export function PanelHeader(props: {
    /** Title shown at the top of the panel. */
    title: string | JSX.Element;
    /** Additional header content. */
    children?: JSX.Element;
}) {
    return (
        <div class="panel-header">
            <span class="title">{props.title}</span>
            <Show when={props.children}>
                <span class="filler" />
                {props.children}
            </Show>
        </div>
    );
}
