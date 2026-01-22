import Discloure from "@corvu/disclosure";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import { type ComponentProps, createSignal, type JSX, Show, splitProps } from "solid-js";

import "./panel.css";

import styles from "./foldable.module.css";

/** A component whose contents can be expanded or folded.

This component is a styled wrapper around corvu's `Disclosure`.
 */
export function Foldable(
    allProps: {
        /** Title for the component, shown next to the fold/expand button. */
        title?: string | JSX.Element;
        /** Additional header content. */
        header?: JSX.Element;
        /** Content that is expanded or folded. */
        children: JSX.Element;
        /** Whether the foldable should be expanded by default. */
        defaultExpanded?: boolean;
    } & ComponentProps<"div">,
) {
    const [props, divProps] = splitProps(allProps, [
        "title",
        "header",
        "children",
        "defaultExpanded",
    ]);
    const [isExpanded, setIsExpanded] = createSignal(props.defaultExpanded ?? false);

    return (
        <Discloure expanded={isExpanded()} onExpandedChange={setIsExpanded} collapseBehavior="hide">
            <div {...divProps}>
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
            </div>
        </Discloure>
    );
}
