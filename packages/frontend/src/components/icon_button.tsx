import Tooltip from "@corvu/tooltip";
import { type JSX, splitProps } from "solid-js";

import "./icon_button.css";

/** Styled, unobstrusive button intended to include an icon.
 */
export function IconButton(
    allProps: {
        children: JSX.Element;
    } & JSX.ButtonHTMLAttributes<HTMLButtonElement>,
) {
    const [props, buttonProps] = splitProps(allProps, ["children"]);

    return (
        <Tooltip openOnHover>
            <Tooltip.Trigger>
                <button class="icon-button" {...buttonProps}>
                    {props.children}
                </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
                <Tooltip.Content data-corvu-tooltip-content={props}>
                    Tooltip content
                    <Tooltip.Arrow />
                </Tooltip.Content>
            </Tooltip.Portal>
        </Tooltip>
    );
}
