import { createContext, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { KbdKey } from "catcolab-ui-components";
import type { FocusMatcher } from "../focus";

/** A registered keyboard shortcut binding.
 *
 * The `when` matcher is evaluated against the current `FocusContext` target.
 * The most-specific matching binding wins; ties are broken by registration
 * order. See `matcherSpecificity` for the specificity ordering.
 */
export type ShortcutBinding = {
    /** Keys that must be pressed.
     *
     * The last entry is the main key (matched case-insensitively against
     * `evt.key`); any preceding entries are required modifiers. Modifiers not
     * listed must NOT be active, so e.g. `["T"]` does not fire on `Ctrl+T`.
     */
    keys: KbdKey[];

    /** Predicate determining when this binding is eligible to fire, given the
     * current focus target. Use the `focusMatch` constructors to build one. */
    when: FocusMatcher;

    /** Handler invoked when the binding fires.
     *
     * The dispatcher calls `evt.preventDefault()` after a successful dispatch,
     * so handlers don't need to.
     */
    handler: (evt: KeyboardEvent) => void;

    /** If true, fire even when the event target is an editable element
     * (`<input>`, `<textarea>`, `contenteditable`). Default: false. */
    allowInEditable?: boolean;

    /** Optional human-readable label, intended for future help / cheatsheet UI. */
    label?: string;
};

/** Handle returned from `register`; call `dispose` to remove the binding. */
export type ShortcutHandle = {
    dispose: () => void;
};

/** Value provided by `ShortcutContext`. */
export type ShortcutContextValue = {
    /** Imperatively register a binding. Returns a handle that disposes it. */
    register: (binding: ShortcutBinding) => ShortcutHandle;
};

/** Context owning the global keyboard shortcut dispatcher. */
export const ShortcutContext = createContext<ShortcutContextValue>();

/** Retrieve the shortcut context from application context. */
export function useShortcutContext(): ShortcutContextValue {
    const ctx = useContext(ShortcutContext);
    invariant(ctx, "ShortcutContext should be provided as context");
    return ctx;
}
