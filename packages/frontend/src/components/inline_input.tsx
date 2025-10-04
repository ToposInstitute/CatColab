import { TextInput, type TextInputOptions } from "./text_input";

import "./inline_input.css";

/** Props for `InlineInput` component */
type InlineInputProps = InlineInputOptions & {
    text: string;
    setText: (text: string) => void;
};

/** Optional props for `InlineInput` component. */
export type InlineInputOptions = TextInputOptions & {
    placeholder?: string;
    status?: InlineInputErrorStatus;
};

/** Error status for `InlineInput` component. */
export type InlineInputErrorStatus = null | "incomplete" | "invalid";

/** An input component that is displayed inline.

Unlike a typical `input` element, this component resizes itself to fit its
content, instead of having a fixed width. It is styled to blend into surrounding
content, e.g., it has no border or background.
 */
export const InlineInput = (props: InlineInputProps) => (
    // Uses a hidden filler element to size the input field:
    // https://stackoverflow.com/a/41389961
    <div class="inline-input-container">
        <span class="inline-input-filler">{props.text || props.placeholder}</span>
        <TextInput
            class="inline-input"
            classList={{
                incomplete: props.status === "incomplete",
                invalid: props.status === "invalid",
            }}
            {...props}
        />
    </div>
);
