import { createEffect, createSignal, type JSX } from "solid-js";

import { type DefaultFocusHandle, FocusContext, type FocusContextValue } from "./context";
import { type FocusTarget, focusTargetEquals, focusTargetToString } from "./types";

/** A registered default-focus candidate. */
type DefaultCandidate = {
    /** Accessor returning the candidate's current focus target. */
    target: () => FocusTarget;
    /** Last target value the candidate was elected to, used to detect when
     * the disposed candidate is the active default. */
    lastElected: FocusTarget | null;
};

/** Provides `FocusContext` to descendants.
 *
 * Owns a single signal storing the user's currently focused element. Also
 * maintains an ordered list of "default focus candidates" \u2014 components
 * (typically notebooks) that opt to receive focus automatically whenever no
 * other element claims it. The first registered candidate wins.
 */
export function FocusProvider(props: { children: JSX.Element }) {
    const [focused, setFocused] = createSignal<FocusTarget | null>(null);
    const [candidates, setCandidates] = createSignal<DefaultCandidate[]>([], {
        equals: false,
    });

    // Log focus changes to the console for debugging.
    createEffect(() => {
        console.debug("[focus]", focusTargetToString(focused()));
    });

    // Auto-elect a default candidate whenever focus is null.
    createEffect(() => {
        if (focused() !== null) {
            return;
        }
        const list = candidates();
        const first = list[0];
        if (!first) {
            return;
        }
        const t = first.target();
        first.lastElected = t;
        setFocused(t);
    });

    const registerDefault = (target: () => FocusTarget): DefaultFocusHandle => {
        const candidate: DefaultCandidate = { target, lastElected: null };
        setCandidates((list) => {
            list.push(candidate);
            return list;
        });
        return {
            dispose: () => {
                setCandidates((list) => {
                    const idx = list.indexOf(candidate);
                    if (idx >= 0) {
                        list.splice(idx, 1);
                    }
                    return list;
                });
                // If the disposed candidate is the currently focused default,
                // clear focus so the next candidate is elected.
                const current = focused();
                if (
                    candidate.lastElected !== null &&
                    current !== null &&
                    focusTargetEquals(current, candidate.lastElected)
                ) {
                    setFocused(null);
                }
            },
        };
    };

    const value: FocusContextValue = {
        focused,
        setFocused,
        isFocused: (target: FocusTarget) => {
            const current = focused();
            return current !== null && focusTargetEquals(current, target);
        },
        registerDefault,
    };

    return <FocusContext.Provider value={value}>{props.children}</FocusContext.Provider>;
}
