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

/** Props for `PlaceholderInlineInput` component. */
export type PlaceholderInlineInputProps = {
    /** Placeholder text to display. Defaults to `"..."`. */
    placeholder?: string;
};

/** A non-editable placeholder shaped like an `InlineInput`.

Renders the same DOM shell as `InlineInput` (so its size, baseline, and spacing
match a real inline input) but with no underlying text field. Use this where an
`InlineInput` would normally appear but the input cannot yet be edited (e.g.
because its parent state is incomplete) and you want a dimmed placeholder
occupying the same space.
 */
export const PlaceholderInlineInput = (props: PlaceholderInlineInputProps) => (
    <div class="inline-input-container">
        <span class="inline-input-filler placeholder-inline-input">
            {props.placeholder ?? "..."}
        </span>
    </div>
);
