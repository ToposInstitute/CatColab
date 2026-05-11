import { type Accessor, createContext, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { FocusTarget } from "./types";

/** Handle returned by `registerDefault`; call `dispose` to remove the candidate. */
export type DefaultFocusHandle = {
    dispose: () => void;
};

/** Value provided by `FocusContext`. */
export type FocusContextValue = {
    /** Currently focused target, or `null` if nothing is focused. */
    focused: Accessor<FocusTarget | null>;

    /** Set the focused target. Pass `null` to clear focus. */
    setFocused: (target: FocusTarget | null) => void;

    /** Convenience: is the given target currently focused? Uses structural
     * equality, so reconstructed targets compare correctly. */
    isFocused: (target: FocusTarget) => boolean;

    /** Register a default focus candidate.
     *
     * Whenever `focused()` would otherwise be `null`, the provider auto-sets
     * focus to the value returned by the first registered candidate's accessor.
     * Candidates are tracked in registration order; in two-pane layouts, the
     * pane that mounts first wins.
     *
     * If the disposed candidate's last value matches the current focus, focus
     * is cleared so the next candidate is elected.
     */
    registerDefault: (target: () => FocusTarget) => DefaultFocusHandle;
};

/** Context tracking the user's currently focused element across the app. */
export const FocusContext = createContext<FocusContextValue>();

/** Retrieve the focus context from application context. */
export function useFocus(): FocusContextValue {
    const ctx = useContext(FocusContext);
    invariant(ctx, "FocusContext should be provided as context");
    return ctx;
}
