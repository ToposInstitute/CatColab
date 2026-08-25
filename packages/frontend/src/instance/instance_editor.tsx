import type { ApiInstance } from "./live_doc_compatibility";

import styles from "./instance_editor.module.css";

/** Placeholder editor for the data instance of a model. */
export function InstanceEditor(_props: { instance: ApiInstance }) {
    return (
        <div class={styles.editor}>
            <a href="http://textfiles.com/underconstruction/">🚧 UNDER CONSTRUCTION 🚧</a>
        </div>
    );
}
