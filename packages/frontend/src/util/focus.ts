import { type Accessor, createEffect } from "solid-js";

/** Focus an input component when a condition holds. */
export function focusInputWhen(
    ref: Accessor<HTMLInputElement | undefined>,
    when: Accessor<boolean>,
) {
    createEffect(() => {
        const el = ref();
        if (el && when()) {
            el.focus();
            // Move cursor to end of input.
            el.selectionStart = el.selectionEnd = el.value.length;
        }
    });
}
