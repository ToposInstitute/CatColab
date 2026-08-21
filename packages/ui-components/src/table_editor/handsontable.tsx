import { createEffect, onCleanup, untrack } from "solid-js";

import HandsontableCore from "./handsontable_core.js";
import { patchHandsontableListbox } from "./handsontable_listbox";

import "handsontable-mit/dist/handsontable.full.css";
import styles from "./handsontable.module.css";

patchHandsontableListbox();

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

    createEffect(() => {
        const settings = props.settings;
        if (table) {
            table.updateSettings(settings, false);
        } else {
            const instance = new HandsontableCore(container, settings);
            table = instance;
            untrack(() => props.onReady?.(instance));
        }
    });

    onCleanup(() => {
        table?.destroy();
        table = undefined;
    });

    return <div ref={container} class={`${styles.table}${props.class ? ` ${props.class}` : ""}`} />;
}
