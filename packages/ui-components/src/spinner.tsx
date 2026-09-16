import { type ComponentProps, splitProps } from "solid-js";

import "./spinner.css";

export function Spinner(allProps: { class?: string } & ComponentProps<"div">) {
    const [props, divProps] = splitProps(allProps, ["class"]);
    return (
        <div
            class={["spinner", props.class].filter(Boolean).join(" ")}
            aria-label="Loading..."
            {...divProps}
        />
    );
}
