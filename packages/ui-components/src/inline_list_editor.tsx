import {
    type Accessor,
    batch,
    createEffect,
    createSignal,
    Index,
    type JSX,
    mergeProps,
    Show,
    untrack,
} from "solid-js";

import type { TextInputOptions } from "./text_input";
import { type FocusHandle, useChildFocus } from "./util/focus";

import styles from "./inline_list_editor.module.css";

/** Options passed to each item input rendered by an `InlineListEditor`.

These options should be spread onto a `TextInput`-like input component
rendering the item. They wire the item input into the list's focus management
and keyboard navigation.
 */
export type InlineListItemOptions = Pick<
    TextInputOptions,
    | "focus"
    | "deleteBackward"
    | "deleteForward"
    | "exitBackward"
    | "exitForward"
    | "exitLeft"
    | "exitRight"
    | "interceptKeyDown"
> & {
    /** Called when the displayed text of the item input changes.

    Tracking the text allows the list editor to avoid pruning empty placeholder
    items that have incomplete, user-entered text.
     */
    onTextChange: (text: string) => void;
};

type InlineListEditorProps<T> = TextInputOptions & {
    /** Items in the list, where `null` is an empty placeholder item. */
    items: Array<T | null>;

    /** Handler to set a new list of items. */
    setItems: (items: Array<T | null>) => void;

    /** Renders the input for a single item in the list.

    The supplied options should be spread onto the item's input component.
     */
    children: (
        item: Accessor<T | null>,
        setItem: (item: T | null) => void,
        options: InlineListItemOptions,
        index: number,
    ) => JSX.Element;

    /** Key that inserts a new item after the current one. Defaults to `","`. */
    insertKey?: string;

    /** Element displayed before the first item. */
    startDelimiter?: JSX.Element | string;

    /** Element displayed after the last item. */
    endDelimiter?: JSX.Element | string;

    /** Element displayed between consecutive items. */
    separator?: (index: number) => JSX.Element | string;
};

/** Edits an inline list of items.

Items are rendered horizontally, surrounded by delimiters and punctuated by
separators, like elements of a list or tuple in mathematical notation. The
rendering of each item is delegated to the `children` render prop.

The component manages focus across the item inputs and provides editing
actions: inserting an item with the insert key, deleting items with focus
repair, navigating with arrow keys and `Home`/`End`, and pruning empty
placeholder items when focus is lost.
 */
export function InlineListEditor<T>(originalProps: InlineListEditorProps<T>) {
    const props = mergeProps(
        {
            insertKey: ",",
            startDelimiter: <div class={styles.defaultDelimiter}>{"["}</div>,
            endDelimiter: <div class={styles.defaultDelimiter}>{"]"}</div>,
            separator: () => <div class={styles.defaultSeparator}>{","}</div>,
        },
        originalProps,
    );

    const parentFocus: FocusHandle = {
        hasFocus: () => props.focus?.hasFocus() ?? !!props.isActive,
        setFocused: (focused) => {
            if (props.focus) {
                props.focus.setFocused(focused);
            } else if (focused) {
                props.hasFocused?.();
            }
        },
    };
    const focus = useChildFocus<number>(parentFocus, { default: 0 });

    // Track which indices have non-empty text (including incomplete input).
    const inputTexts = new Map<number, string>();

    const updateItems = (f: (items: Array<T | null>) => void) => {
        const items = [...props.items];
        f(items);
        props.setItems(items);
    };

    const insertNewItem = (i: number) => {
        batch(() => {
            updateItems((items) => {
                items.splice(i, 0, null);
            });
            focus.setActiveChild(i);
        });
    };

    // Insert a new item into an empty list when focus is gained.
    createEffect(() => {
        if (parentFocus.hasFocus() && untrack(() => props.items).length === 0) {
            insertNewItem(0);
        }
    });

    /** Clean up null placeholders that have no user-entered text. */
    const deactivate = () => {
        const items = props.items.filter(
            (item, i) => item !== null || (inputTexts.get(i) ?? "") !== "",
        );
        if (items.length !== props.items.length) {
            props.setItems(items);
        }
    };

    // Clean up when the component becomes inactive.
    createEffect(() => {
        if (!parentFocus.hasFocus()) {
            untrack(() => deactivate());
        }
    });

    // Show the trailing "add item" when the list is focused or hovered.
    const [isHovered, setIsHovered] = createSignal(false);

    const hasTrailingAddItem = () =>
        (parentFocus.hasFocus() || isHovered()) && props.items[props.items.length - 1] !== null;

    const lastNavigableIndex = () =>
        hasTrailingAddItem() ? props.items.length : props.items.length - 1;

    const itemOptions = (i: number): InlineListItemOptions => ({
        onTextChange: (text) => inputTexts.set(i, text),
        focus: focus.childFocus(i),
        deleteBackward: () =>
            batch(() => {
                if (i < props.items.length) {
                    updateItems((items) => {
                        items.splice(i, 1);
                    });
                }
                if (i === 0) {
                    props.deleteBackward?.();
                } else {
                    focus.setActiveChild(i - 1);
                }
            }),
        deleteForward: () =>
            batch(() => {
                if (i < props.items.length) {
                    updateItems((items) => {
                        items.splice(i, 1);
                    });
                }
                if (i === 0) {
                    props.deleteForward?.();
                }
            }),
        exitBackward: () => props.exitBackward?.(),
        exitForward: () => props.exitForward?.(),
        exitLeft: () => {
            if (i === 0) {
                props.exitLeft?.();
            } else {
                focus.setActiveChild(i - 1);
            }
        },
        exitRight: () => {
            if (i === lastNavigableIndex()) {
                props.exitRight?.();
            } else {
                focus.setActiveChild(i + 1);
            }
        },
        interceptKeyDown: (evt) => {
            if (evt.key === props.insertKey) {
                insertNewItem(i + 1);
                return true;
            } else if (evt.key === "Home" && !evt.shiftKey) {
                // TODO: Should move to beginning of input.
                focus.setActiveChild(0);
            } else if (evt.key === "End" && !evt.shiftKey) {
                focus.setActiveChild(lastNavigableIndex());
            }
            return false;
        },
    });

    const appendItem = (item: T | null) => {
        props.setItems(item === null ? props.items : [...props.items, item]);
    };

    let listRef!: HTMLUListElement;

    return (
        <ul
            ref={listRef}
            class={styles.inlineList}
            onMouseDown={(evt) => {
                if (props.items.length === 0) {
                    insertNewItem(0);
                    parentFocus.setFocused(true);
                    evt.preventDefault();
                }
            }}
            onFocusOut={(evt) => {
                // Lose focus only when it moves outside the list entirely.
                const next = evt.relatedTarget as Element | null;
                if (next && listRef.contains(next)) {
                    return;
                }
                parentFocus.setFocused(false);
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {props.startDelimiter}
            <Index
                each={props.items}
                fallback={
                    <Show when={!hasTrailingAddItem()}>
                        <input class={styles.emptyListInput} />
                    </Show>
                }
            >
                {(item, i) => (
                    <li>
                        <Show when={i > 0 && props.separator}>{(sep) => sep()(i)}</Show>
                        {props.children(
                            item,
                            (newItem) => {
                                updateItems((items) => {
                                    items[i] = newItem;
                                });
                            },
                            itemOptions(i),
                            i,
                        )}
                    </li>
                )}
            </Index>
            <Show when={hasTrailingAddItem()}>
                <li>
                    <Show when={props.items.length > 0 && props.separator}>
                        {(sep) => sep()(props.items.length)}
                    </Show>
                    {props.children(
                        () => null,
                        appendItem,
                        itemOptions(props.items.length),
                        props.items.length,
                    )}
                </li>
            </Show>
            {props.endDelimiter}
        </ul>
    );
}
