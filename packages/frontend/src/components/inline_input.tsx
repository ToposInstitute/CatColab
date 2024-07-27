import { focus } from "@solid-primitives/active-element";
import { For, type JSX, Show, createMemo, createSignal } from "solid-js";
focus;

import "./inline_input.css";
import type { KbdKey } from "@solid-primitives/keyboard";

export const KbdShortcut = (props: {
    shortcut: KbdKey[];
}) => (
    <kbd class="shortcut">
        <For each={props.shortcut}>{(key) => <kbd class="key">{key}</kbd>}</For>
    </kbd>
);

export type Completion = {
    name: string;
    description?: string;
    shortcut?: KbdKey[];
    onComplete?: () => void;
};

type CompletionsProps = {
    completions: Completion[];
    presumptive: number;
    setPresumptive: (i: number) => void;
};

function Completions(props: CompletionsProps) {
    return (
        <div class="completions-container">
            <ul role="listbox" class="completion-list">
                <For each={props.completions}>
                    {(c, i) => (
                        <li
                            role="option"
                            classList={{ active: i() === props.presumptive }}
                            onMouseOver={() => props.setPresumptive(i())}
                            onMouseDown={() => c.onComplete?.()}
                        >
                            <div class="completion-head">
                                <div class="completion-name">{c.name}</div>
                                <Show when={c.shortcut}>
                                    <div class="completion-shortcut">
                                        <KbdShortcut shortcut={c.shortcut as KbdKey[]} />
                                    </div>
                                </Show>
                            </div>
                            <Show when={c.description}>
                                <div class="completion-description">{c.description}</div>
                            </Show>
                        </li>
                    )}
                </For>
            </ul>
            <Show when={props.completions.length === 0}>
                <span class="completion-empty">No completions</span>
            </Show>
        </div>
    );
}

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
    const [presumptive, setPresumptive] = createSignal(0);

    const remainingCompletions = createMemo(() => {
        setPresumptive(0);
        return props.completions?.filter((c) =>
            c.name.toLowerCase().startsWith(props.text.toLowerCase()),
        );
    });

    function selectPresumptive() {
        const completions = remainingCompletions();
        if (completions && completions.length > 0) {
            completions[presumptive()].onComplete?.();
        }
    }

    const onKeyDown: JSX.EventHandlerUnion<HTMLInputElement, KeyboardEvent> = (evt) => {
        const completions = remainingCompletions();
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
            if (completions && completionsOpened()) {
                setPresumptive((i) => Math.max(0, i - 1));
            } else if (props.exitUp) {
                props.exitUp();
            }
        } else if (evt.key === "ArrowDown") {
            if (completions && completionsOpened()) {
                setPresumptive((i) => Math.min(completions.length - 1, i + 1));
            } else if (props.exitDown) {
                props.exitDown();
            }
        } else if (evt.key === "Enter" && !evt.shiftKey) {
            selectPresumptive();
        } else if (evt.key === "Escape") {
            setCompletionedOpened(false);
            setPresumptive(0);
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
            <Show when={completionsOpened() && remainingCompletions()}>
                {(completions) => (
                    <Completions
                        completions={completions()}
                        presumptive={presumptive()}
                        setPresumptive={setPresumptive}
                    />
                )}
            </Show>
        </div>
    );
}
