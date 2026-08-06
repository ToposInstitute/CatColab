import { onCleanup, onMount } from "solid-js";

import {
    formatShortcut,
    HistoryNavigator,
    keyEventHasModifier,
    primaryModifier,
} from "catcolab-ui-components";
import type { LocalHistory } from "./history";
import { SketchSeparator } from "./Rough";

import styles from "./HistorySidebar.module.css";

/**
 * The history sidebar shown docked to a panel. It maps a {@link LocalHistory}
 * onto the shared `HistoryNavigator` — the exact component the CatColab frontend
 * uses — so it looks and behaves like the frontend's, and installs the same
 * undo/redo keyboard shortcuts (scoped to when this sidebar's panel is active).
 *
 * @param active  Whether this sidebar's panel currently owns keyboard focus, so
 *                only the focused panel's shortcuts fire (matching the frontend's
 *                per-pane behaviour).
 */
export function HistorySidebar(props: { history: LocalHistory; active?: () => boolean }) {
    onMount(() => {
        const onKeyDown = (evt: KeyboardEvent) => {
            if (props.active && !props.active()) {
                return;
            }
            const key = evt.key.toUpperCase();
            const hasPrimary = keyEventHasModifier(evt, primaryModifier);
            if (!hasPrimary || evt.altKey) {
                return;
            }
            if (key === "Z" && !evt.shiftKey && props.history.canUndo()) {
                props.history.onUndo();
                evt.preventDefault();
                return;
            }
            if (
                ((key === "Z" && evt.shiftKey) || (key === "Y" && !evt.shiftKey)) &&
                props.history.canRedo()
            ) {
                props.history.onRedo();
                evt.preventDefault();
                return;
            }
        };
        window.addEventListener("keydown", onKeyDown);
        onCleanup(() => window.removeEventListener("keydown", onKeyDown));
    });

    return (
        <div class={styles.historySidebar}>
            <SketchSeparator edge="left" seed={113} />
            <HistoryNavigator
                items={props.history.items()}
                canUndo={props.history.canUndo()}
                canRedo={props.history.canRedo()}
                onUndo={props.history.onUndo}
                onRedo={props.history.onRedo}
                onSelect={props.history.navigate}
                undoTooltip={`Undo (${formatShortcut([primaryModifier, "Z"])})`}
                redoTooltip={`Redo (${formatShortcut([primaryModifier, "Shift", "Z"])} or ${formatShortcut([primaryModifier, "Y"])})`}
            />
        </div>
    );
}
