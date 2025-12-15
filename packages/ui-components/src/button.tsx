import { type ComponentProps, type JSX, splitProps } from "solid-js";

import "./button.css";

export type ButtonVariant = "positive" | "utility" | "danger";

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
            case "positive":
                return "button-positive";
            case "utility":
                return "button-utility";
            case "danger":
                return "button-danger";
            default:
                return "button-utility";
        }
    };

    return (
        <button
            class={`button ${variantClass()}`}
            type={buttonProps.type || "button"}
            {...buttonProps}
        >
            {props.children}
        </button>
    );
}
