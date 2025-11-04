import Popover from "@corvu/popover";
import { focus } from "@solid-primitives/active-element";
import { type JSX, createEffect, createSignal } from "solid-js";
focus;

import { type Completion, Completions, type CompletionsRef } from "catcolab-ui-components";
import type { InputOptions } from "./input_options";

import "./inline_input.css";

/** Optional props for `InlineInput` component. */
export type InlineInputOptions = InputOptions & {
    placeholder?: string;
    status?: InlineInputErrorStatus;
    completions?: Completion[];
    showCompletionsOnFocus?: boolean;
    autofill?: () => void;
    interceptKeyDown?: (evt: InputElementKeyboardEvent) => boolean;
};

type InputElementKeyboardEvent = Parameters<JSX.EventHandler<HTMLInputElement, KeyboardEvent>>[0];

/** Error status for `InlineInput` component. */
export type InlineInputErrorStatus = null | "incomplete" | "invalid";

/** An input component that is displayed inline.
 *
 * Optionally, supports a dropdown of completions.
 */
export function InlineInput(
    props: {
        text: string;
        setText: (text: string) => void;
    } & InlineInputOptions,
) {
    let ref!: HTMLInputElement;

    createEffect(() => {
        if (props.isActive && document.activeElement !== ref) {
            ref.focus();
            // Move cursor to end of input.
            ref.selectionStart = ref.selectionEnd = ref.value.length;
        }
    });

    const [isCompletionsOpen, setCompletionsOpen] = createSignal(false);
    const [completionsRef, setCompletionsRef] = createSignal<CompletionsRef>();

    const onKeyDown: JSX.EventHandler<HTMLInputElement, KeyboardEvent> = (evt) => {
        const remaining = completionsRef()?.remainingCompletions() ?? [];
        const value = evt.currentTarget.value;
        if (props.interceptKeyDown?.(evt)) {
        } else if (props.deleteBackward && evt.key === "Backspace" && !value) {
            props.deleteBackward();
        } else if (props.deleteForward && evt.key === "Delete" && !value) {
            props.deleteForward();
        } else if (props.exitBackward && evt.key === "Tab" && evt.shiftKey) {
            props.exitBackward();
        } else if (props.exitForward && evt.key === "Tab" && !evt.shiftKey) {
            props.exitForward();
        } else if (
            props.exitLeft &&
            evt.key === "ArrowLeft" &&
            evt.currentTarget.selectionEnd === 0
        ) {
            props.exitLeft();
        } else if (
            props.exitRight &&
            evt.key === "ArrowRight" &&
            evt.currentTarget.selectionStart === value.length
        ) {
            props.exitRight();
        } else if (evt.key === "ArrowUp") {
            if (remaining.length > 0 && isCompletionsOpen()) {
                completionsRef()?.previousPresumptive();
            } else if (props.exitUp) {
                props.exitUp();
            }
        } else if (evt.key === "ArrowDown") {
            if (remaining.length > 0 && isCompletionsOpen()) {
                completionsRef()?.nextPresumptive();
            } else if (props.exitDown) {
                props.exitDown();
            }
        } else if (evt.key === "Enter" && !evt.shiftKey) {
            if (isCompletionsOpen()) {
                completionsRef()?.selectPresumptive();
            } else if (props.autofill) {
                props.autofill();
            }
        } else {
            return;
        }
        evt.preventDefault();
    };

    // Uses a hidden filler element to size the input field:
    // https://stackoverflow.com/a/41389961
    return (
        <Popover
            open={props.completions && isCompletionsOpen()}
            onOpenChange={(open) => {
                setCompletionsOpen(open);
                if (!open) {
                    completionsRef()?.setPresumptive(0);
                }
            }}
            floatingOptions={{
                autoPlacement: {
                    allowedPlacements: ["bottom-start", "top-start"],
                },
            }}
            closeOnOutsideFocus={false}
            closeOnOutsidePointer={false}
            trapFocus={false}
        >
            <Popover.Anchor>
                <div class="inline-input-container">
                    <span class="inline-input-filler">{props.text || props.placeholder}</span>
                    <input
                        class="inline-input"
                        type="text"
                        size="1"
                        ref={ref}
                        classList={{
                            incomplete: props.status === "incomplete",
                            invalid: props.status === "invalid",
                        }}
                        value={props.text}
                        placeholder={props.placeholder}
                        use:focus={(isFocused) => {
                            isFocused && props.hasFocused && props.hasFocused();
                            (!isFocused || props.showCompletionsOnFocus) &&
                                setCompletionsOpen(isFocused);
                        }}
                        onInput={(evt) => {
                            props.setText(evt.target.value);
                            setCompletionsOpen(true);
                        }}
                        onKeyDown={onKeyDown}
                    />
                </div>
            </Popover.Anchor>
            <Popover.Portal>
                <Popover.Content class="popup">
                    <Completions
                        completions={props.completions ?? []}
                        text={props.text}
                        ref={setCompletionsRef}
                        onComplete={() => setCompletionsOpen(false)}
                    />
                </Popover.Content>
            </Popover.Portal>
        </Popover>
    );
}
