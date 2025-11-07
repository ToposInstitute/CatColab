import { type ComponentProps, type JSX, mergeProps, splitProps } from "solid-js";

import "./button.css";

export type ButtonVariant = "primary" | "utility" | "danger";

export function Button(
    allProps: {
        /** Visual variant of the button */
        variant?: ButtonVariant;
        /** Button content - can be text, icon, or both */
        children: JSX.Element;
    } & ComponentProps<"button">,
) {
    const [props, buttonProps] = splitProps(allProps, ["variant", "children"]);

    const variantClass = () => {
        switch (props.variant) {
            case "primary":
                return "button-primary";
            case "utility":
                return "button-utility";
            case "danger":
                return "button-danger";
            default:
                return "button-utility";
        }
    };

    const mergedProps = mergeProps({ type: "button" as const }, buttonProps);

    return (
        <button class={`button ${variantClass()}`} {...mergedProps}>
            {props.children}
        </button>
    );
}
