import { createEffect, createSignal } from "solid-js";

import "./input.css";


// Optional props for `InlineInput` component.
export type InlineInputOptions = {
    ref?: HTMLInputElement;
    placeholder?: string;

    deleteBackward?: () => void;
    deleteForward?: () => void;

    exitUp?: () => void;
    exitDown?: () => void;
    exitLeft?: () => void;
    exitRight?: () => void;
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
            if (props.deleteBackward && evt.key === "Backspace" &&
                value === "") {
                props.deleteBackward();
            } else if (props.deleteForward && evt.key === "Delete" &&
                       value === "") {
                props.deleteForward();
            } else if (props.exitLeft && evt.key === "ArrowLeft" &&
                       evt.currentTarget.selectionEnd == 0) {
                props.exitLeft();
            } else if (props.exitRight && evt.key === "ArrowRight" &&
                       evt.currentTarget.selectionStart == value.length) {
                props.exitRight();
            } else if (props.exitUp && evt.key === "ArrowUp") {
                props.exitUp();
            } else if (props.exitDown && evt.key === "ArrowDown") {
                props.exitDown();
            } else {
                return;
            }
            evt.preventDefault();
        }}
    ></input>;
}
