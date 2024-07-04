import { createEffect, createSignal, JSX, splitProps } from "solid-js";

import "./input.css";


export function InlineInput(allProps: {
    text: string,
    setText: (text: string) => void;
} & JSX.InputHTMLAttributes<HTMLInputElement>) {
    const [props, inputProps] = splitProps(allProps, ["text", "setText"]);

    const computeWidth = (text: string) => {
        let width = 0;
        if (text) {
            width = text.length;
        } else if (inputProps.placeholder) {
            width = inputProps.placeholder.length;
        }
        return width;
    };

    const [width, setWidth] = createSignal(0);

    createEffect(() => {
        setWidth(computeWidth(props.text));
    })

    return (
        <input class="inline-input" type="text" size="1"
            style={{ width: width() + 'ch' }}
            value={props.text}
            onInput={(evt) => {
                let text = evt.target.value;
                setWidth(computeWidth(text));
                props.setText(text);
            }}
            {...inputProps}>
        </input>
    );
}
