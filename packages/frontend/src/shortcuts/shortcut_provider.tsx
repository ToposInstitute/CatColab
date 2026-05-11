import { makeEventListener } from "@solid-primitives/event-listener";
import type { JSX } from "solid-js";
import { match, P } from "ts-pattern";

import { keyEventHasModifier, type ModifierKey } from "catcolab-ui-components";
import { matcherMatches, matcherSpecificity, useFocus } from "../focus";
import {
    ShortcutContext,
    type ShortcutBinding,
    type ShortcutContextValue,
    type ShortcutHandle,
} from "./context";

const MODIFIERS: readonly ModifierKey[] = ["Alt", "Control", "Meta", "Shift"];

function isModifier(k: string): k is ModifierKey {
    return (MODIFIERS as readonly string[]).includes(k);
}

/** Input types that are NOT considered editable for the purpose of shortcut
 * suppression (e.g. clicking a checkbox shouldn't block global shortcuts). */
const NON_EDITABLE_INPUT_TYPES = new Set([
    "button",
    "checkbox",
    "radio",
    "submit",
    "reset",
    "file",
]);

/** Returns whether the event target is an editable element. */
function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    if (target.isContentEditable) {
        return true;
    }
    return match(target)
        .with(P.instanceOf(HTMLTextAreaElement), () => true)
        .with(P.instanceOf(HTMLInputElement), (el) => !NON_EDITABLE_INPUT_TYPES.has(el.type))
        .otherwise(() => false);
}

/** Does the event match the binding's keys?
 *
 * Required modifiers (every modifier in the array except possibly the last
 * entry) must be active. Non-listed modifiers must be inactive. The last entry
 * is matched case-insensitively against `evt.key`.
 */
function eventMatchesKeys(evt: KeyboardEvent, keys: readonly string[]): boolean {
    if (keys.length === 0) {
        return false;
    }
    const main = keys[keys.length - 1] as string;
    const required = new Set<ModifierKey>(keys.slice(0, -1).filter(isModifier));

    for (const m of MODIFIERS) {
        if (required.has(m) !== keyEventHasModifier(evt, m)) {
            return false;
        }
    }

    if (isModifier(main)) {
        return evt.key === main;
    }
    return evt.key.toUpperCase() === main.toUpperCase();
}

/** Provides `ShortcutContext` and runs a single window keydown dispatcher.
 *
 * Must be mounted inside a `FocusProvider` because the dispatcher consults
 * `useFocus()` to decide which bindings are eligible.
 */
export function ShortcutProvider(props: { children: JSX.Element }) {
    const focus = useFocus();
    // Insertion-ordered set of registered bindings.
    const bindings = new Set<ShortcutBinding>();

    const register = (binding: ShortcutBinding): ShortcutHandle => {
        bindings.add(binding);
        return { dispose: () => bindings.delete(binding) };
    };

    makeEventListener(window, "keydown", (evt) => {
        const focused = focus.focused();
        const editable = isEditableTarget(evt.target);

        let best: ShortcutBinding | null = null;
        let bestSpecificity = -1;
        for (const b of bindings) {
            if (editable && !b.allowInEditable) {
                continue;
            }
            if (!matcherMatches(b.when, focused)) {
                continue;
            }
            if (!eventMatchesKeys(evt, b.keys)) {
                continue;
            }
            // Most-specific matcher wins; iteration order breaks ties.
            const s = matcherSpecificity(b.when);
            if (s > bestSpecificity) {
                best = b;
                bestSpecificity = s;
            }
        }

        if (best) {
            best.handler(evt);
            evt.preventDefault();
        }
    });

    const value: ShortcutContextValue = { register };
    return <ShortcutContext.Provider value={value}>{props.children}</ShortcutContext.Provider>;
}
