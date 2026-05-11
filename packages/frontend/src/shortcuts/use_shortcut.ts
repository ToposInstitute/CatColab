import { onCleanup } from "solid-js";

import { type ShortcutBinding, useShortcutContext } from "./context";

/** Register a keyboard shortcut for the lifetime of the calling component.
 *
 * The binding is captured at the time of the call; it is not reactive. For
 * dynamic bindings (e.g. when keys or scope change over time), call
 * `useShortcutContext().register` inside a `createEffect`.
 */
export function useShortcut(binding: ShortcutBinding): void {
    const { register } = useShortcutContext();
    const handle = register(binding);
    onCleanup(handle.dispose);
}
