import { createMemo, createSignal, For, type JSX, onMount, Show } from "solid-js";

import type { KbdKey } from "./util/keyboard";

import "./completions.css";

/** A possible completion. */
export type Completion = {
    /** Short name of completion. */
    name: string;

    /** Extra CSS class applied to the name element. */
    nameClass?: string;

    /** One-line description of completion. */
    description?: string | JSX.Element;

    /** Icon to show with completion. */
    icon?: JSX.Element;

    /** Keyboard shortcut associated with completion. */
    shortcut?: KbdKey[];

    /** Function called when completion is selected. */
    onComplete?: () => void;

    /** Whether this completion is the current value, and so highlighted initially. */
    selected?: boolean;

    /** Whether to render a visual separator before this completion. */
    separatorBefore?: boolean;
};

export type CompletionsRef = {
    remainingCompletions: () => Completion[];
    presumptive: () => number;
    setPresumptive: (i: number) => void;
    resetPresumptive: () => void;
    previousPresumptive: () => void;
    nextPresumptive: () => void;
    selectPresumptive: () => void;
};

export function Completions(props: {
    completions: Completion[];
    text?: string;
    emptyText?: string;
    onComplete?: () => void;
    ref?: (ref: CompletionsRef) => void;
}) {
    const [presumptive, setPresumptive] = createSignal(0);

    const previousPresumptive = () => setPresumptive((i) => Math.max(0, i - 1));
    const nextPresumptive = () =>
        setPresumptive((i) => Math.min(remainingCompletions().length - 1, i + 1));

    const remainingCompletions = createMemo(() => {
        const prefix = props.text?.toLowerCase() ?? "";
        const starts = props.completions?.filter((c) => c.name.toLowerCase().startsWith(prefix));
        const startsNames = new Set(starts.map((c) => c.name.toLowerCase()));
        const includes =
            props.completions?.filter(
                (c) =>
                    c.name.toLowerCase().includes(prefix) && !startsNames.has(c.name.toLowerCase()),
            ) ?? [];
        const remaining = starts.concat(includes);
        setPresumptive(defaultPresumptive(remaining));
        return remaining;
    });

    const separatedIndices = createMemo(() =>
        getSeparatedIndices(remainingCompletions(), props.completions ?? []),
    );

    const resetPresumptive = () => setPresumptive(defaultPresumptive(remainingCompletions()));

    const selectPresumptive = () => {
        const completion = remainingCompletions()[presumptive()];
        if (completion) {
            select(completion);
        }
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
            resetPresumptive,
            previousPresumptive,
            nextPresumptive,
            selectPresumptive,
        }),
    );

    return (
        <ul role="listbox" class="completion-list">
            <For
                each={remainingCompletions()}
                fallback={
                    <span class="completion-empty">{props.emptyText ?? "No completions"}</span>
                }
            >
                {(c, i) => (
                    <li
                        role="option"
                        classList={{
                            active: i() === presumptive(),
                            separated: separatedIndices().has(i()),
                        }}
                        onMouseOver={() => setPresumptive(i())}
                        onMouseDown={(evt) => {
                            // Prevent the input from blurring so focus stays in
                            // the editor when a completion is clicked.
                            evt.preventDefault();
                            select(c);
                        }}
                    >
                        <div class="completion-head">
                            <Show when={c.icon}>
                                <div class="completion-icon">{c.icon}</div>
                            </Show>
                            <div class={`completion-name ${c.nameClass ?? ""}`}>{c.name}</div>
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

/** Index of the completion highlighted initially: the selected one, if any. */
function defaultPresumptive(completions: Completion[]): number {
    return Math.max(
        0,
        completions.findIndex((c) => c.selected),
    );
}

const KbdShortcut = (props: { shortcut: KbdKey[] }) => (
    <kbd class="shortcut">
        <For each={props.shortcut}>{(key) => <kbd class="key">{key}</kbd>}</For>
    </kbd>
);

/**
 * Maps each completion to its group index based on `separatorBefore` boundaries
 * in the original completions list.
 */
function getCompletionGroups(completions: readonly Completion[]) {
    const groupsByRef = new Map<Completion, number>();
    const groupsByName = new Map<string, number>();
    let group = 0;
    for (let i = 0; i < completions.length; i++) {
        const c = completions[i];
        if (c) {
            if (i > 0 && c.separatorBefore) {
                group++;
            }
            groupsByRef.set(c, group);
            if (!groupsByName.has(c.name)) {
                groupsByName.set(c.name, group);
            }
        }
    }
    return (c: Completion): number => {
        return groupsByRef.get(c) ?? groupsByName.get(c.name) ?? 0;
    };
}

/**
 * Computes the indices in the visible list before which a separator should be rendered.
 *
 * A separator is rendered before a visible item if:
 * 1. It is not the first visible item (`i > 0`), AND
 * 2. It belongs to a strictly higher group than the immediately preceding visible item.
 */
export function getSeparatedIndices(
    visible: readonly Completion[],
    allCompletions: readonly Completion[],
): Set<number> {
    const indices = new Set<number>();
    if (visible.length <= 1 || allCompletions.length === 0) {
        return indices;
    }
    const getGroup = getCompletionGroups(allCompletions);
    for (let i = 1; i < visible.length; i++) {
        const prev = visible[i - 1];
        const curr = visible[i];
        if (prev && curr) {
            const prevGroup = getGroup(prev);
            const currGroup = getGroup(curr);
            if (currGroup > prevGroup) {
                indices.add(i);
            }
        }
    }
    return indices;
}
