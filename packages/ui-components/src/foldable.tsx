import Discloure from "@corvu/disclosure";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Settings from "lucide-solid/icons/settings";
import { createSignal, type JSX, Show } from "solid-js";

import "./foldable.css";
import "./panel.css";

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

    // NOTE: Set the collapse behavior to "hide" to get a smooth animation.
    return (
        <Discloure expanded={isExpanded()} onExpandedChange={setIsExpanded} collapseBehavior="hide">
            <div class="foldable-wrapper">
                <div class="foldable-header panel-header">
                    <Show when={props.title}>
                        <span class="title">{props.title}</span>
                    </Show>
                    <Show when={props.header}>
                        <span class="filler" />
                        {props.header}
                    </Show>
                </div>
                <Discloure.Trigger class="foldable-trigger">
                    <Settings size={14} />
                    <Show when={isExpanded()} fallback={<ChevronRight size={14} />}>
                        <ChevronDown size={14} />
                    </Show>
                </Discloure.Trigger>
            </div>
            <Discloure.Content>{props.children}</Discloure.Content>
        </Discloure>
    );
}
