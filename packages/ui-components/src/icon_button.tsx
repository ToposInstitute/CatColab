import Tooltip from "@corvu/tooltip";
import { type ComponentProps, type JSX, Show, splitProps } from "solid-js";

import "./icon_button.css";

/** Styled, unobstrusive button intended to include an icon.
 */
export function IconButton(
    allProps: {
        children: JSX.Element;
        tooltip?: JSX.Element | string;
        variant?: "default" | "danger" | "positive";
    } & ComponentProps<"button">,
) {
    const [props, buttonProps] = splitProps(allProps, ["children", "tooltip", "variant"]);
    const [buttonRef, triggerProps] = splitProps(buttonProps, ["ref"]);

    // corvu's trigger declares `ref` as non-nullable-when-present, so it cannot
    // receive our possibly-undefined `ref` directly. Forward it through a
    // callback rather than a conditional spread: Solid compiles a spread into
    // `mergeProps`, whose proxy re-evaluates the spread expression on every read
    // of a prop absent from the sibling static props, which silently subscribes
    // unrelated computations to the spread's condition. Solid always hands
    // components a callback ref, so the element form needs no handling here.
    const forwardButtonRef = (element: HTMLButtonElement) => {
        const ref = buttonRef.ref;
        if (typeof ref === "function") {
            ref(element);
        }
    };

    const buttonClass = () => {
        const baseClass = "icon-button";
        switch (props.variant) {
            case "danger":
                return `${baseClass} icon-button-danger`;
            case "positive":
                return `${baseClass} icon-button-positive`;
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
                    <Tooltip.Trigger class={buttonClass()} {...triggerProps} ref={forwardButtonRef}>
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
