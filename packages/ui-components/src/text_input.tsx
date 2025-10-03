import Popover from "@corvu/popover";
import { focus } from "@solid-primitives/active-element";
import { type ComponentProps, type JSX, createEffect, createSignal, splitProps } from "solid-js";
focus;

import { type Completion, Completions, type CompletionsRef } from "./completions";
import { assertTypelevel } from "./util/types";

/** Props for `TextInput` component. */
type TextInputProps = Omit<ComponentProps<"input">, "onKeyDown"> &
    TextInputOptions & {
        text: string;
        setText: (text: string) => void;
    };

/** Optional props available to a `TextInput` component. */
export type TextInputOptions = TextInputActions & {
    /** Whether the input is active: allowed to the grab the focus. */
    isActive?: boolean;

    /** Called when component has received focus. */
    hasFocused?: () => void;

    /** List of possible auto-completions. */
    completions?: Completion[];

    /** Whether to show possible auto-completions when focus is gained. */
    showCompletionsOnFocus?: boolean;

    /** Called to intercept `keydown` events.`

    Return `true` to intercept the event and prevent normal processing.
     */
    interceptKeyDown?: (evt: InputElementKeyboardEvent) => boolean;
};

type InputElementKeyboardEvent = Parameters<JSX.EventHandler<HTMLInputElement, KeyboardEvent>>[0];

/** Actions invokable in `TextInput` component, possibly affecting nearby components. */
type TextInputActions = {
    /** Request to automatically fill out the input. */
    autofill?: () => void;

    /** Request to delete this component and then move backward.

    Here "backward" means left or, if at the left boundary, then up. Typically
    triggered by pressing `Backspace`.
     */
    deleteBackward?: () => void;

    /** Request to delete this component and then move forward.

    Here "forward" means right or, if at the right boundary, then down.
    Typically triggered by pressing `Delete`.
     */
    deleteForward?: () => void;

    /** Request to exit this component and move backward.

    Here "backward" can mean left or up, possibly with cycling. Typically
    triggered by pressing `Tab`.
     */
    exitBackward?: () => void;

    /** Request to exit this component and move forward.

    Here "forward" can mean right or down, possibly with cycling. Typically
    triggered by pressing `Shift + Tab`.
     */
    exitForward?: () => void;

    /** Request to exit this component and move upward. */
    exitUp?: () => void;

    /** Request to exit this component and move downward. */
    exitDown?: () => void;

    /** Request to exit this component and move left. */
    exitLeft?: () => void;

    /** Request to exit this component and move right. */
    exitRight?: () => void;
};

// XXX: Need the list of options as a *value* to split props.
const TEXT_INPUT_OPTIONS = [
    "isActive",
    "hasFocused",
    "completions",
    "showCompletionsOnFocus",
    "interceptKeyDown",
    "autofill",
    "deleteBackward",
    "deleteForward",
    "exitBackward",
    "exitForward",
    "exitUp",
    "exitDown",
    "exitLeft",
    "exitRight",
] as const satisfies Array<keyof Required<TextInputOptions>>;

assertTypelevel<
    keyof Required<TextInputOptions> extends (typeof TEXT_INPUT_OPTIONS)[number] ? true : false
>;

/** A general-purpose text input component with extra features.

The input field itself is just an unstyled `<input>` element. A host of options
are provided for managing focus of this and nearby components, as well as
showing auto-completions.
 */
export function TextInput(allProps: TextInputProps) {
    const [props, options, inputProps] = splitProps(
        allProps,
        ["text", "setText"],
        TEXT_INPUT_OPTIONS,
    );

    let ref!: HTMLInputElement;

    createEffect(() => {
        if (options.isActive && document.activeElement !== ref) {
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
        if (options.interceptKeyDown?.(evt)) {
        } else if (options.deleteBackward && evt.key === "Backspace" && !value) {
            options.deleteBackward();
        } else if (options.deleteForward && evt.key === "Delete" && !value) {
            options.deleteForward();
        } else if (options.exitBackward && evt.key === "Tab" && evt.shiftKey) {
            options.exitBackward();
        } else if (options.exitForward && evt.key === "Tab" && !evt.shiftKey) {
            options.exitForward();
        } else if (
            options.exitLeft &&
            evt.key === "ArrowLeft" &&
            evt.currentTarget.selectionEnd === 0
        ) {
            options.exitLeft();
        } else if (
            options.exitRight &&
            evt.key === "ArrowRight" &&
            evt.currentTarget.selectionStart === value.length
        ) {
            options.exitRight();
        } else if (evt.key === "ArrowUp") {
            if (remaining.length > 0 && isCompletionsOpen()) {
                completionsRef()?.previousPresumptive();
            } else if (options.exitUp) {
                options.exitUp();
            }
        } else if (evt.key === "ArrowDown") {
            if (remaining.length > 0 && isCompletionsOpen()) {
                completionsRef()?.nextPresumptive();
            } else if (options.exitDown) {
                options.exitDown();
            }
        } else if (evt.key === "Enter" && !evt.shiftKey) {
            if (isCompletionsOpen()) {
                completionsRef()?.selectPresumptive();
            } else if (options.autofill) {
                options.autofill();
            }
        } else {
            return;
        }
        evt.preventDefault();
    };

    return (
        <Popover
            open={options.completions && isCompletionsOpen()}
            onOpenChange={(open) => {
                setCompletionsOpen(open);
                if (!open) {
                    completionsRef()?.setPresumptive(0);
                }
            }}
            placement="bottom-start"
            closeOnOutsideFocus={false}
            closeOnOutsidePointer={false}
            trapFocus={false}
        >
            <Popover.Anchor>
                <input
                    type="text"
                    ref={ref}
                    value={props.text}
                    use:focus={(isFocused) => {
                        isFocused && options.hasFocused?.();
                        (!isFocused || options.showCompletionsOnFocus) &&
                            setCompletionsOpen(isFocused);
                    }}
                    onInput={(evt) => {
                        props.setText(evt.target.value);
                        setCompletionsOpen(true);
                    }}
                    onKeyDown={onKeyDown}
                    {...inputProps}
                />
            </Popover.Anchor>
            <Popover.Portal>
                <Popover.Content class="popup">
                    <Completions
                        completions={options.completions ?? []}
                        text={props.text}
                        ref={setCompletionsRef}
                        onComplete={() => setCompletionsOpen(false)}
                    />
                </Popover.Content>
            </Popover.Portal>
        </Popover>
    );
}
