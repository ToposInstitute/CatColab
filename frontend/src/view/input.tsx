import { createEffect, createSignal, JSX } from "solid-js";

import "./input.css";


export function InlineInput(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
    const [width, setWidth] = createSignal(0);

    createEffect(() => {
        let width = 0;
        if (props.value && typeof props.value === "string") {
            width = props.value.length;
        } else if (props.placeholder) {
            width = props.placeholder.length;
        }
        setWidth(width);
    });

    return (
        <input class="inline-input" type="text" size="1"
               style={{ width: width() + 'ch' }}
               {...props}>
        </input>
    );
}
