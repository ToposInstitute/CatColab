import Tooltip from "@corvu/tooltip";
import { type ComponentProps, type JSX, Show, splitProps } from "solid-js";

import "./icon_button.css";

/** Styled, unobstrusive button intended to include an icon.
 */
export function IconButton(
    allProps: {
        children: JSX.Element;
        tooltip?: JSX.Element | string;
        variant?: "default" | "danger" | "primary";
    } & ComponentProps<"button">,
) {
    const [props, buttonProps] = splitProps(allProps, ["children", "tooltip", "variant"]);

    const buttonClass = () => {
        const baseClass = "icon-button";
        switch (props.variant) {
            case "danger":
                return `${baseClass} icon-button-danger`;
            case "primary":
                return `${baseClass} icon-button-primary`;
            default:
                return baseClass;
        }
    };

    return (
        <Show
            when={props.tooltip}
            fallback={
                <button class={buttonClass()} {...buttonProps}>
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
