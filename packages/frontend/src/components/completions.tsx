import type { KbdKey } from "@solid-primitives/keyboard";
import { For, Show, createMemo, createSignal, onMount } from "solid-js";

import "./completions.css";

export type Completion = {
    name: string;
    description?: string;
    shortcut?: KbdKey[];
    onComplete?: () => void;
};

export type CompletionsRef = {
    remainingCompletions: () => Completion[];
    presumptive: () => number;
    setPresumptive: (i: number | ((old: number) => void)) => void;
    selectPresumptive: () => void;
};

export function Completions(props: {
    completions: Completion[];
    text: string;
    ref?: (ref: CompletionsRef) => void;
}) {
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

    onMount(() =>
        props.ref?.({ remainingCompletions, presumptive, setPresumptive, selectPresumptive }),
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
    );
}

const KbdShortcut = (props: {
    shortcut: KbdKey[];
}) => (
    <kbd class="shortcut">
        <For each={props.shortcut}>{(key) => <kbd class="key">{key}</kbd>}</For>
    </kbd>
);
