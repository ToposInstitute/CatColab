import { focus } from "@solid-primitives/active-element";
import { type JSX, Show, createSignal } from "solid-js";
focus;

import { type Completion, Completions, type CompletionsRef } from "./completions";

import "./inline_input.css";

/** Optional props for `InlineInput` component.
 */
export type InlineInputOptions = {
    ref?: HTMLInputElement;
    placeholder?: string;
    status?: InlineInputErrorStatus;
    completions?: Completion[];

    deleteBackward?: () => void;
    deleteForward?: () => void;
    exitBackward?: () => void;
    exitForward?: () => void;
    exitUp?: () => void;
    exitDown?: () => void;
    exitLeft?: () => void;
    exitRight?: () => void;
    onFocus?: () => void;
};

/** Error status for `InlineInput` component.
 */
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
    const [completionsOpened, setCompletionedOpened] = createSignal(true);
    const [completionsRef, setCompletionsRef] = createSignal<CompletionsRef>();

    const onKeyDown: JSX.EventHandlerUnion<HTMLInputElement, KeyboardEvent> = (evt) => {
        const remaining = completionsRef()?.remainingCompletions() ?? [];
        const value = evt.currentTarget.value;
        if (props.deleteBackward && evt.key === "Backspace" && !value) {
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
            if (remaining.length > 0 && completionsOpened()) {
                completionsRef()?.previousPresumptive();
            } else if (props.exitUp) {
                props.exitUp();
            }
        } else if (evt.key === "ArrowDown") {
            if (remaining.length > 0 && completionsOpened()) {
                completionsRef()?.nextPresumptive();
            } else if (props.exitDown) {
                props.exitDown();
            }
        } else if (evt.key === "Enter" && !evt.shiftKey) {
            completionsRef()?.selectPresumptive();
        } else if (evt.key === "Escape") {
            setCompletionedOpened(false);
            completionsRef()?.setPresumptive(0);
        } else {
            setCompletionedOpened(true);
            return;
        }
        evt.preventDefault();
    };

    // Uses a hidden filler element: https://stackoverflow.com/a/41389961
    return (
        <div>
            <div class="inline-input-container">
                <span class="inline-input-filler">{props.text || props.placeholder}</span>
                <input
                    class="inline-input"
                    type="text"
                    size="1"
                    ref={props.ref}
                    classList={{
                        incomplete: props.status === "incomplete",
                        invalid: props.status === "invalid",
                    }}
                    value={props.text}
                    placeholder={props.placeholder}
                    use:focus={(isFocused: boolean) => {
                        isFocused && props.onFocus && props.onFocus();
                    }}
                    onBlur={() => setCompletionedOpened(false)}
                    onClick={() => setCompletionedOpened(true)}
                    onInput={(evt) => props.setText(evt.target.value)}
                    onKeyDown={onKeyDown}
                />
            </div>
            <Show when={completionsOpened() && props.completions}>
                {(completions) => (
                    <div class="inline-input-completions popup">
                        <Completions
                            completions={completions()}
                            text={props.text}
                            ref={setCompletionsRef}
                        />
                    </div>
                )}
            </Show>
        </div>
    );
}
