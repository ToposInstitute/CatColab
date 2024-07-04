import { createEffect, createSignal } from "solid-js";

import "./input.css";


export enum InputBoundary {
    Top = "TOP",
    Bottom = "BOTTOM",
    Left = "LEFT",
    Right = "RIGHT",
}

// Optional props for inline input component.
export type InlineInputOptions = {
    ref?: HTMLInputElement;
    placeholder?: string;
    delete?: () => void;
    exit?: ((where: InputBoundary) => void);
}

export function InlineInput(props: {
    text: string,
    setText: (text: string) => void;
} & InlineInputOptions) {
    const computeWidth = (text: string) => {
        let width = 0;
        if (text) {
            width = text.length;
        } else if (props.placeholder) {
            width = props.placeholder.length;
        }
        return width;
    };

    const [width, setWidth] = createSignal(0);

    createEffect(() => {
        setWidth(computeWidth(props.text));
    })

    return <input class="inline-input" type="text" size="1"
        ref={props.ref}
        style={{ width: width() + 'ch' }}
        value={props.text}
        placeholder={props.placeholder}
        onInput={(evt) => {
            let text = evt.target.value;
            setWidth(computeWidth(text));
            props.setText(text);
        }}
        onKeyDown={(evt) => {
            const value = evt.currentTarget.value;
            if (props.delete && evt.key === "Backspace" && value === "") {
                props.delete();
            } else if (props.exit && evt.key === "ArrowLeft" &&
                       evt.currentTarget.selectionEnd == 0) {
                props.exit(InputBoundary.Left);
            } else if (props.exit && evt.key === "ArrowRight" &&
                       evt.currentTarget.selectionStart == value.length) {
                props.exit(InputBoundary.Right);
            }
        }}
    ></input>;
}
