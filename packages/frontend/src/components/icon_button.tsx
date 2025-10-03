import Tooltip from "@corvu/tooltip";
import { type ComponentProps, type JSX, Show, splitProps } from "solid-js";

import "./icon_button.css";

/** Styled, unobstrusive button intended to include an icon.
 */
export function IconButton(
    allProps: {
        children: JSX.Element;
        tooltip?: JSX.Element | string;
    } & ComponentProps<"button">,
) {
    const [props, buttonProps] = splitProps(allProps, ["children", "tooltip"]);

    return (
        <Show
            when={props.tooltip}
            fallback={
                <button class="icon-button" {...buttonProps}>
                    {props.children}
                </button>
            }
        >
            <Tooltip hoverableContent={false} openOnFocus={false}>
                <Tooltip.Anchor>
                    <Tooltip.Trigger class="icon-button" {...buttonProps}>
                        {props.children}
                    </Tooltip.Trigger>
                </Tooltip.Anchor>
                <Tooltip.Portal>
                    <Tooltip.Content class="tooltip-content">{props.tooltip}</Tooltip.Content>
                </Tooltip.Portal>
            </Tooltip>
        </Show>
    );
}
