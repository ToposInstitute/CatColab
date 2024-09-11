import Tooltip from "@corvu/tooltip";
import { type JSX, splitProps } from "solid-js";

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
            {props.tooltip && (
                <Tooltip.Portal>
                    <Tooltip.Content>{props.tooltip}</Tooltip.Content>
                </Tooltip.Portal>
            )}
        </Tooltip>
    );
}
