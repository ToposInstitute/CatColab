import Tooltip from "@corvu/tooltip";
import { type JSX, children, splitProps } from "solid-js";

import "./icon_button.css";

/** Styled, unobstrusive button intended to include an icon.
 */
export function IconButton(
    allProps: {
        children: JSX.Element;
        tooltip?: string;
    } & JSX.ButtonHTMLAttributes<HTMLButtonElement>,
) {
    const [props, buttonProps] = splitProps(allProps, ["children", "tooltip"]);

    return (
        <Tooltip openOnHover>
            <Tooltip.Trigger class="icon-button" {...buttonProps}>
                {props.children}
            </Tooltip.Trigger>
            <Tooltip.Portal>
                {props.tooltip && (
                    <Tooltip.Content data-corvu-tooltip-content={props}>
                        {props.tooltip}
                    </Tooltip.Content>
                )}
            </Tooltip.Portal>
        </Tooltip>
    );
}
