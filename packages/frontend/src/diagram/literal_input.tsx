import { createEffect, createSignal } from "solid-js";

import type { LiteralValue, Ob } from "catlog-wasm";

/** Input for entering a literal attribute value (string, int, float, bool).
 */
export function LiteralInput(props: {
    ob: Ob | null;
    setOb: (ob: Ob | null) => void;
    placeholder?: string;
    isActive?: boolean;
    isInvalid?: boolean;
    hasFocused?: () => void;
    deleteBackward?: () => void;
    deleteForward?: () => void;
    exitBackward?: () => void;
    exitForward?: () => void;
    exitLeft?: () => void;
    exitRight?: () => void;
}) {
    let inputRef: HTMLInputElement | undefined;

    // Extract string value from Ob::Literal if present
    const getValue = (): string => {
        if (props.ob?.tag === "Literal") {
            const lit = props.ob.content as LiteralValue;
            if (lit.tag === "String") {
                return lit.content as string;
            }
            return String(lit.content);
        }
        return "";
    };

    const [localValue, setLocalValue] = createSignal(getValue());

    // Sync local value when prop changes
    createEffect(() => {
        setLocalValue(getValue());
    });

    // Focus input when active
    createEffect(() => {
        if (props.isActive && inputRef) {
            inputRef.focus();
        }
    });

    // Parse a string value into the appropriate LiteralValue type
    const parseLiteralValue = (value: string): { tag: string; content: unknown } => {
        // Check for boolean
        if (value.toLowerCase() === "true") {
            return { tag: "Bool", content: true };
        }
        if (value.toLowerCase() === "false") {
            return { tag: "Bool", content: false };
        }

        // Check for integer (no decimal point, valid integer format)
        if (/^-?\d+$/.test(value)) {
            const intVal = parseInt(value, 10);
            if (!isNaN(intVal) && Number.isSafeInteger(intVal)) {
                return { tag: "Int", content: intVal };
            }
        }

        // Check for float (has decimal point or scientific notation)
        if (/^-?\d*\.?\d+([eE][+-]?\d+)?$/.test(value) && value.includes(".")) {
            const floatVal = parseFloat(value);
            if (!isNaN(floatVal) && isFinite(floatVal)) {
                return { tag: "Float", content: floatVal };
            }
        }

        // Default to string
        return { tag: "String", content: value };
    };

    const handleChange = (value: string) => {
        setLocalValue(value);
        if (value === "") {
            props.setOb(null);
        } else {
            // Parse the value into the appropriate type
            props.setOb({
                tag: "Literal",
                content: parseLiteralValue(value),
            });
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        const input = e.target as HTMLInputElement;
        const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
        const atEnd =
            input.selectionStart === input.value.length &&
            input.selectionEnd === input.value.length;
        const isEmpty = input.value === "";

        switch (e.key) {
            case "Backspace":
                if (isEmpty && props.deleteBackward) {
                    e.preventDefault();
                    props.deleteBackward();
                } else if (atStart && props.exitBackward) {
                    e.preventDefault();
                    props.exitBackward();
                }
                break;
            case "Delete":
                if (isEmpty && props.deleteForward) {
                    e.preventDefault();
                    props.deleteForward();
                }
                break;
            case "ArrowLeft":
                if (atStart && props.exitLeft) {
                    e.preventDefault();
                    props.exitLeft();
                }
                break;
            case "ArrowRight":
                if (atEnd && props.exitRight) {
                    e.preventDefault();
                    props.exitRight();
                }
                break;
            case "ArrowUp":
                if (props.exitBackward) {
                    e.preventDefault();
                    props.exitBackward();
                }
                break;
            case "ArrowDown":
            case "Enter":
            case "Tab":
                if (props.exitForward) {
                    e.preventDefault();
                    props.exitForward();
                }
                break;
        }
    };

    return (
        <input
            ref={inputRef}
            type="text"
            class="literal-input"
            classList={{ invalid: props.isInvalid }}
            value={localValue()}
            placeholder={props.placeholder ?? "value..."}
            onInput={(e) => handleChange(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => props.hasFocused?.()}
        />
    );
}
