import { Anchor, Content, Portal, Root, Trigger, type RootProps } from "@corvu/tooltip";
import { type Component, type JSX, Show, splitProps } from "solid-js";

import "./tooltip.css";

/** A unified tooltip component.

A styled wrapper around corvu's `Tooltip`: it renders the `content` in a
floating element with the standard tooltip styling whenever the `trigger`
component is hovered or focused. The appearance of the content element can
be fully replaced via `contentClass` for specialized usages (e.g. popups
with interactive content).
 */
export function Tooltip(
    allProps: {
        /** Content to display in the tooltip. */
        content: JSX.Element | string;
        /** Component used to render the trigger; receives the trigger props. */
        trigger?: Component<Record<string, unknown>>;
        /** Class of the tooltip content element. Defaults to `tooltip-content`. */
        contentClass?: string;
    } & Omit<RootProps, "children">,
) {
    const [props, rootProps] = splitProps(allProps, ["content", "trigger", "contentClass"]);

    return (
        <Root {...rootProps}>
            <Show when={props.trigger}>
                <Anchor>
                    <Trigger as={props.trigger} />
                </Anchor>
            </Show>
            <Portal>
                <Content class={props.contentClass ?? "tooltip-content"}>{props.content}</Content>
            </Portal>
        </Root>
    );
}
