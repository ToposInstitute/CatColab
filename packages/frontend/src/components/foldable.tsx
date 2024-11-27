import Discloure from "@corvu/disclosure";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronUp from "lucide-solid/icons/chevron-up";
import { type JSX, Show, createSignal } from "solid-js";

import "./foldable.css";

/** A component whose contents can be expanded or folded.

This component is a styled wrapper around corvu's `Disclosure`. We could likely
just as well have used kobalte's `Collapsible`.
 */
export function Foldable(props: {
    header?: JSX.Element;
    children: JSX.Element;
}) {
    const [isExpanded, setIsExpanded] = createSignal(false);

    // NOTE: Set the collapse behavior to "hide" to get a smooth animation.
    return (
        <Discloure expanded={isExpanded()} onExpandedChange={setIsExpanded} collapseBehavior="hide">
            <div class="foldable-header">
                {props.header}
                <Discloure.Trigger>
                    <Show when={isExpanded()} fallback={<ChevronDown />}>
                        <ChevronUp />
                    </Show>
                </Discloure.Trigger>
            </div>
            <Discloure.Content>{props.children}</Discloure.Content>
        </Discloure>
    );
}
