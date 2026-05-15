/** Utilities for keyboard events and shortcuts.

The types `ModifierKey` and `KbdKey` are borrowed from
`@solid-primitives/keyboard`, a package that we're no longer using.

@module
 */

export type ModifierKey = "Alt" | "Control" | "Meta" | "Shift";
export type KbdKey = ModifierKey | (string & {});

/** Platform-appropriate primary modifier key for editor shortcuts.

Uses Meta (Cmd) on Mac and Control elsewhere, matching native app convention.
 */
export const primaryModifier: ModifierKey = navigator.userAgent.includes("Mac")
    ? "Meta"
    : "Control";

/** Platform-appropriate secondary modifier key for editor shortcuts.

Uses Control on Mac, where Alt/Option remaps keys, and Alt elsewhere, where
Control tends to already be bound.
 */
export const secondaryModifier: ModifierKey = navigator.userAgent.includes("Mac")
    ? "Control"
    : "Alt";

/** Returns whether the modifier key is active in the keyboard event. */
export function keyEventHasModifier(evt: KeyboardEvent, key: ModifierKey): boolean {
    switch (key) {
        case "Alt":
            return evt.altKey;
        case "Control":
            return evt.ctrlKey;
        case "Meta":
            return evt.metaKey;
        case "Shift":
            return evt.shiftKey;
        default:
            throw new Error(`Key is not a modifier: ${key}`);
    }
}

/** Format a modifier key for display to the user (e.g. "Cmd" on Mac, "Ctrl" elsewhere). */
function formatModifierKey(key: ModifierKey, isMac: boolean): string {
    switch (key) {
        case "Meta":
            return isMac ? "Cmd" : "Win";
        case "Control":
            return isMac ? "⌃" : "Ctrl";
        case "Shift":
            return "Shift";
        case "Alt":
            return isMac ? "⌥" : "Alt";
    }
}

/** Format a keyboard shortcut for display to the user.
 *
 * Takes an array of keys (modifiers followed by the main key) and returns
 * a human-readable string like "Cmd+Z" or "Ctrl+Shift+Z".
 */
export function formatShortcut(keys: KbdKey[]): string {
    if (keys.length === 0) {
        return "";
    }
    const isMac = navigator.userAgent.includes("Mac");
    const parts = keys.map((key) => {
        if (key === "Meta" || key === "Control" || key === "Alt" || key === "Shift") {
            return formatModifierKey(key as ModifierKey, isMac);
        }
        return key;
    });
    return parts.join("+");
}
