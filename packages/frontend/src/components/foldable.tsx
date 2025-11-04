import Discloure from "@corvu/disclosure";
import { type JSX, Show, createSignal } from "solid-js";

import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";

import "./foldable.css";
import "catcolab-ui-components/panel.css";

/** A component whose contents can be expanded or folded.

This component is a styled wrapper around corvu's `Disclosure`. We could likely
just as well have used kobalte's `Collapsible`.
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
            <div class="foldable-header panel-header">
                <Discloure.Trigger class="foldable-trigger">
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
            <Discloure.Content>{props.children}</Discloure.Content>
        </Discloure>
    );
}
