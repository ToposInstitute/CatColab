import { createEffect, createSignal, splitProps } from "solid-js";

import {
    InlineInput,
    type InlineInputErrorStatus,
    type InlineInputOptions,
} from "catcolab-ui-components";

/** Input a human-readable name for a formal element.

In CatColab, a valid name is any string that is *not* a decimal numeral, since
the latter are used as anonymous identifiers. See the `IdInput` component.
 */
export function NameInput(
    allProps: {
        name: string;
        setName: (name: string) => void;
    } & Omit<InlineInputOptions, "status">,
) {
    const [props, inputProps] = splitProps(allProps, ["name", "setName"]);

    const [text, setText] = createSignal("");

    createEffect(() => setText(props.name));

    const status = (): InlineInputErrorStatus => (text() === props.name ? null : "invalid");

    const handleNewText = (text: string) => {
        if (!/^\d+$/.test(text)) {
            props.setName(text);
        }
        setText(text);
    };

    return <InlineInput text={text()} setText={handleNewText} status={status()} {...inputProps} />;
}
