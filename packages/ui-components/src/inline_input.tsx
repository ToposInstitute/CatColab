import type { JSX } from "solid-js";

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

/** Props for `StaticInlineInput` component. */
export type StaticInlineInputProps = {
    /** Content displayed in place of the input's text. */
    children?: JSX.Element;

    /** Error status, displayed as in an `InlineInput`. */
    status?: InlineInputErrorStatus;

    /** Whether to de-emphasize the content, as a placeholder. */
    isPlaceholder?: boolean;

    /** Extra CSS class applied to the content. */
    class?: string;

    /** Called on mouse down, e.g., to activate the input that this replaces. */
    onMouseDown?: (evt: MouseEvent) => void;
};

/** A non-editable display shaped like an `InlineInput`.

Renders the same DOM elements as `InlineInput`, so that its size, baseline, and
spacing match a real inline input, but with static content in place of the text
input field.
 */
export const StaticInlineInput = (props: StaticInlineInputProps) => (
    <div class="inline-input-container" onMouseDown={(evt) => props.onMouseDown?.(evt)}>
        <span
            class={`inline-input-filler static-inline-input ${props.class ?? ""}`}
            classList={{
                "placeholder-inline-input": props.isPlaceholder,
                incomplete: props.status === "incomplete",
                invalid: props.status === "invalid",
            }}
        >
            {props.children}
        </span>
    </div>
);

/** Props for `PlaceholderInlineInput` component. */
export type PlaceholderInlineInputProps = {
    /** Placeholder text to display. Defaults to `"..."`. */
    placeholder?: string;
};

/** A non-editable placeholder shaped like an `InlineInput`.

Use this where an `InlineInput` would normally appear but the input cannot yet
be edited (e.g. because its parent state is incomplete) and you want a dimmed
placeholder occupying the same space.
 */
export const PlaceholderInlineInput = (props: PlaceholderInlineInputProps) => (
    <StaticInlineInput isPlaceholder>{props.placeholder ?? "..."}</StaticInlineInput>
);
