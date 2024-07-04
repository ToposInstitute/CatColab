import { createEffect, createSignal } from "solid-js";
import { JSX } from "solid-js/jsx-runtime";

import "./input.css";


export function InlineInput(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
    const [width, setWidth] = createSignal(0);

    createEffect(() => {
        let width = 0;
        if (typeof props.value === "string" && props.value) {
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
