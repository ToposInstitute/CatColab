import { Tooltip } from "@kobalte/core/tooltip";
import { type ComponentProps, type JSX, Show, createSignal, splitProps } from "solid-js";

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

    const [tooltipOpen, setTooltipOpen] = createSignal(false);

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
            <Tooltip open={tooltipOpen()} onOpenChange={setTooltipOpen} openDelay={1000}>
                <Tooltip.Trigger class={buttonClass()} {...buttonProps}>
                    {props.children}
                </Tooltip.Trigger>
                <Tooltip.Portal>
                    <Tooltip.Content
                        class="tooltip-content"
                        onMouseEnter={() => setTooltipOpen(false)}
                    >
                        {props.tooltip}
                    </Tooltip.Content>
                </Tooltip.Portal>
            </Tooltip>
        </Show>
    );
}
