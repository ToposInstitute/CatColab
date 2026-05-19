import { createEffect, createSignal, type Accessor } from "solid-js";

/** Focus state passed down a component tree. */
export type FocusHandle = {
    hasFocus: Accessor<boolean>;
    setFocused: (focused: boolean) => void;
};

/** Root focus handle for a tree that should always remember its last focus. */
export const rootFocus: FocusHandle = {
    hasFocus: () => true,
    setFocused: () => {},
};

/** Track which immediate child of a focused parent has focus. */
export function useChildFocus<K>(
    parent: FocusHandle,
    options?: { default?: K },
): {
    activeChild: Accessor<K | null>;
    setActiveChild: (child: K | null) => void;
    childFocus: (child: K) => FocusHandle;
} {
    const [activeChild, setActiveChild] = createSignal<K | null>(options?.default ?? null);

    createEffect(() => {
        if (!parent.hasFocus()) {
            setActiveChild(() => options?.default ?? null);
        }
    });

    const childFocus = (child: K): FocusHandle => ({
        hasFocus: () => parent.hasFocus() && activeChild() === child,
        setFocused: (focused) => {
            if (focused) {
                setActiveChild(() => child);
                parent.setFocused(true);
            } else if (activeChild() === child) {
                setActiveChild(() => options?.default ?? null);
            }
        },
    });

    return { activeChild, setActiveChild, childFocus };
}
