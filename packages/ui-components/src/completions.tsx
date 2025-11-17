import { createMemo, createSignal, For, type JSX, onMount, Show } from "solid-js";

import type { KbdKey } from "./util/keyboard";

import "./completions.css";

/** A possible completion. */
export type Completion = {
    /** Short name of completion. */
    name: string;

    /** One-line description of completion. */
    description?: string;

    /** Icon to show with completion. */
    icon?: JSX.Element;

    /** Keyboard shortcut associated with completion. */
    shortcut?: KbdKey[];

    /** Function called when completion is selected. */
    onComplete?: () => void;
};

export type CompletionsRef = {
    remainingCompletions: () => Completion[];
    presumptive: () => number;
    setPresumptive: (i: number) => void;
    previousPresumptive: () => void;
    nextPresumptive: () => void;
    selectPresumptive: () => void;
};

export function Completions(props: {
    completions: Completion[];
    text?: string;
    onComplete?: () => void;
    ref?: (ref: CompletionsRef) => void;
}) {
    const [presumptive, setPresumptive] = createSignal(0);

    const previousPresumptive = () => setPresumptive((i) => Math.max(0, i - 1));
    const nextPresumptive = () =>
        setPresumptive((i) => Math.min(remainingCompletions().length - 1, i + 1));

    const remainingCompletions = createMemo(() => {
        setPresumptive(0);
        const prefix = props.text?.toLowerCase() ?? "";
        const starts = props.completions?.filter((c) => c.name.toLowerCase().startsWith(prefix));
        const startsNames = new Set(starts.map((c) => c.name.toLowerCase()));
        const includes =
            props.completions?.filter(
                (c) =>
                    c.name.toLowerCase().includes(prefix) && !startsNames.has(c.name.toLowerCase()),
            ) ?? [];
        return starts.concat(includes);
    });

    const selectPresumptive = () => {
        const completion = remainingCompletions()[presumptive()];
        completion && select(completion);
    };

    const select = (completion: Completion) => {
        completion.onComplete?.();
        props.onComplete?.();
    };

    onMount(() =>
        props.ref?.({
            remainingCompletions,
            presumptive,
            setPresumptive,
            previousPresumptive,
            nextPresumptive,
            selectPresumptive,
        }),
    );

    return (
        <ul role="listbox" class="completion-list">
            <For
                each={remainingCompletions()}
                fallback={<span class="completion-empty">No completions</span>}
            >
                {(c, i) => (
                    <li
                        role="option"
                        classList={{ active: i() === presumptive() }}
                        onMouseOver={() => setPresumptive(i())}
                        onMouseDown={() => select(c)}
                    >
                        <div class="completion-head">
                            <Show when={c.icon}>
                                <div class="completion-icon">{c.icon}</div>
                            </Show>
                            <div class="completion-name">{c.name}</div>
                            <Show when={c.shortcut}>
                                <div class="completion-shortcut">
                                    <KbdShortcut shortcut={c.shortcut ?? []} />
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
    );
}

const KbdShortcut = (props: { shortcut: KbdKey[] }) => (
    <kbd class="shortcut">
        <For each={props.shortcut}>{(key) => <kbd class="key">{key}</kbd>}</For>
    </kbd>
);
