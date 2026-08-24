import { createEffect, onCleanup, onMount, untrack } from "solid-js";

import type HandsontableCore from "./handsontable_core.js";

import styles from "./handsontable.module.css";

let handsontablePromise: Promise<typeof HandsontableCore> | undefined;

export type HandsontableSettings = HandsontableCore.GridSettings;
export type HandsontableInstance = HandsontableCore;

export type HandsontableProps = {
    /** Handsontable settings passed to the constructor and `updateSettings`. */
    settings: HandsontableSettings;
    class?: string;
    /** Called after the Handsontable instance is created. */
    onReady?: (instance: HandsontableInstance) => void;
};

/** A Solid lifecycle wrapper around Handsontable. */
export function Handsontable(props: HandsontableProps) {
    let container!: HTMLDivElement;
    let table: HandsontableInstance | undefined;
    let disposed = false;

    createEffect(() => {
        const settings = props.settings;
        table?.updateSettings(settings, false);
    });

    onMount(() => {
        void loadHandsontable().then((HandsontableCore) => {
            if (disposed) {
                return;
            }

            const instance = new HandsontableCore(
                container,
                untrack(() => props.settings),
            );
            table = instance;
            untrack(() => props.onReady?.(instance));
        });
    });

    onCleanup(() => {
        disposed = true;
        table?.destroy();
        table = undefined;
    });

    return <div ref={container} class={`${styles.table}${props.class ? ` ${props.class}` : ""}`} />;
}

function loadHandsontable(): Promise<typeof HandsontableCore> {
    handsontablePromise ??= Promise.all([
        import("handsontable-mit/dist/handsontable.full.css"),
        import("./handsontable_core.js"),
        import("./handsontable_listbox"),
    ]).then(([, { default: HandsontableCore }, { patchHandsontableListbox }]) => {
        patchHandsontableListbox();
        return HandsontableCore;
    });
    return handsontablePromise;
}
