import { type ComponentProps, splitProps } from "solid-js";

import "./spinner.css";

export type SpinnerSize = "small";

export function Spinner(
    allProps: {
        /** Visual size of the spinner; defaults to the standalone size. */
        size?: SpinnerSize;
    } & ComponentProps<"div">,
) {
    const [props, divProps] = splitProps(allProps, ["size", "class"]);

    const sizeClass = () => {
        switch (props.size) {
            case "small":
                return " spinner-small";
            default:
                return "";
        }
    };

    return (
        <div
            class={`spinner${sizeClass()}${props.class ? ` ${props.class}` : ""}`}
            aria-label="Loading..."
            {...divProps}
        />
    );
}
