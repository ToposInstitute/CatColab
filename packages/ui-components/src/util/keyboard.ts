/** Utilities for keyboard events and shortcuts.

The types `ModifierKey` and `KbdKey` are borrowed from
`@solid-primitives/keyboard`, a package that we're no longer using.

@module
 */

export type ModifierKey = "Alt" | "Control" | "Meta" | "Shift";
export type KbdKey = ModifierKey | (string & {});

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
