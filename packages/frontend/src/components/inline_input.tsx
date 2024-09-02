import Popover from "@corvu/popover";
import { focus } from "@solid-primitives/active-element";
import { type JSX, createSignal } from "solid-js";
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
    const [isCompletionsOpen, setCompletionsOpen] = createSignal(true);
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
            completionsRef()?.selectPresumptive();
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
            trapFocus={false}
        >
            <Popover.Anchor>
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
                        onClick={() => setCompletionsOpen(true)}
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
                    />
                </Popover.Content>
            </Popover.Portal>
        </Popover>
    );
}
