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
};

/** Imperative handle for a `Completions` component. */
export type CompletionsRef<T = Completion> = {
    remainingCompletions: () => T[];
    presumptive: () => number;
    setPresumptive: (i: number) => void;
    previousPresumptive: () => void;
    nextPresumptive: () => void;
    selectPresumptive: () => void;
};

/** Default filter for `Completion` items.

Returns items whose `name` starts with the input text first, followed by
items whose `name` contains it (case-insensitive). Items already matched in
the first pass are not duplicated in the second.
 */
export function defaultCompletionFilter(items: Completion[], text: string): Completion[] {
    const prefix = text.toLowerCase();
    const starts = items.filter((c) => c.name.toLowerCase().startsWith(prefix));
    const startsNames = new Set(starts.map((c) => c.name.toLowerCase()));
    const includes = items.filter(
        (c) => c.name.toLowerCase().includes(prefix) && !startsNames.has(c.name.toLowerCase()),
    );
    return starts.concat(includes);
}

/** Default item renderer for `Completion` items. */
export function defaultCompletionRenderer(item: Completion): JSX.Element {
    return (
        <>
            <div class="completion-head">
                <Show when={item.icon}>
                    <div class="completion-icon">{item.icon}</div>
                </Show>
                <div class={`completion-name ${item.nameClass ?? ""}`}>{item.name}</div>
                <Show when={item.shortcut}>
                    <div class="completion-shortcut">
                        <KbdShortcut shortcut={item.shortcut ?? []} />
                    </div>
                </Show>
            </div>
            <Show when={item.description}>
                <div class="completion-description">{item.description}</div>
            </Show>
        </>
    );
}

/** Default selection handler for `Completion` items. */
export function defaultCompletionOnSelect(item: Completion): void {
    item.onComplete?.();
}

/** Props common to `Completions` regardless of item type. */
type CompletionsBaseProps<T> = {
    /** Raw list of items. The displayed list is `filter(items, text ?? "")`. */
    completions: T[];

    /** Current input text used for filtering. */
    text?: string;

    /** Text shown when no completions match. Defaults to "No completions". */
    emptyText?: string;

    /** Called after an item has been selected. Fires after `onSelect`. */
    onComplete?: () => void;

    /** Imperative ref. */
    ref?: (ref: CompletionsRef<T>) => void;

    /** Custom filter for the completions list.

    Receives the raw list and the current input text; returns the items to
    display, in display order. Defaults to `defaultCompletionFilter` (only
    available when `T = Completion`).
     */
    filter?: (items: T[], text: string) => T[];
};

/** Props for `Completions` when items are the built-in `Completion` type. */
type CompletionsCompletionProps = CompletionsBaseProps<Completion> & {
    /** Custom renderer for an item. Defaults to the built-in renderer
        showing the icon, name, shortcut, and description. */
    renderItem?: (item: Completion, presumptive: boolean) => JSX.Element;

    /** Called when an item is selected. Defaults to invoking
        `item.onComplete`. */
    onSelect?: (item: Completion) => void;
};

/** Props for `Completions` when items are a custom type. */
type CompletionsCustomProps<T> = CompletionsBaseProps<T> & {
    /** Custom renderer for an item. Required for non-`Completion` items. */
    renderItem: (item: T, presumptive: boolean) => JSX.Element;

    /** Called when an item is selected. Required for non-`Completion`
        items. */
    onSelect: (item: T) => void;

    /** Filter is required when items are not `Completion` (no default
        exists for arbitrary `T`). */
    filter: (items: T[], text: string) => T[];
};

/** Props for the `Completions` component.

When `T = Completion` (the default), `filter`, `renderItem`, and `onSelect`
all have built-in defaults and are optional. For any other `T`, they are
required.
 */
export type CompletionsProps<T = Completion> = T extends Completion
    ? CompletionsCompletionProps
    : CompletionsCustomProps<T>;

export function Completions<T = Completion>(props: CompletionsProps<T>) {
    // Internal alias: SolidJS components don't generally support generics in
    // the runtime body, so cast once to a concrete shape that exposes the
    // overrides as optional.
    const p = props as CompletionsBaseProps<T> & {
        renderItem?: (item: T, presumptive: boolean) => JSX.Element;
        onSelect?: (item: T) => void;
    };

    const [presumptive, setPresumptive] = createSignal(0);

    const previousPresumptive = () => setPresumptive((i) => Math.max(0, i - 1));
    const nextPresumptive = () =>
        setPresumptive((i) => Math.min(remainingCompletions().length - 1, i + 1));

    const remainingCompletions = createMemo<T[]>(() => {
        setPresumptive(0);
        const text = p.text ?? "";
        if (p.filter) {
            return p.filter(p.completions, text);
        }
        // Default filter only applies to `Completion`; safe because the
        // typed prop overload requires `filter` for non-`Completion` `T`.
        return defaultCompletionFilter(
            p.completions as unknown as Completion[],
            text,
        ) as unknown as T[];
    });

    const renderItem = (item: T, isPresumptive: boolean): JSX.Element => {
        if (p.renderItem) {
            return p.renderItem(item, isPresumptive);
        }
        return defaultCompletionRenderer(item as unknown as Completion);
    };

    const select = (item: T) => {
        if (p.onSelect) {
            p.onSelect(item);
        } else {
            defaultCompletionOnSelect(item as unknown as Completion);
        }
        p.onComplete?.();
    };

    const selectPresumptive = () => {
        const item = remainingCompletions()[presumptive()];
        if (item !== undefined) {
            select(item);
        }
    };

    onMount(() =>
        p.ref?.({
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
                fallback={<span class="completion-empty">{p.emptyText ?? "No completions"}</span>}
            >
                {(c, i) => (
                    <li
                        role="option"
                        classList={{ active: i() === presumptive() }}
                        onMouseOver={() => setPresumptive(i())}
                        onMouseDown={() => select(c)}
                    >
                        {renderItem(c, i() === presumptive())}
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
