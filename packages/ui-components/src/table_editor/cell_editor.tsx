import { onCleanup } from "solid-js";

import { type Completion } from "../completions";
import { TextInput } from "../text_input";
import type { FocusHandle } from "../util/focus";
import type { MoveDirection } from "./navigation";

import styles from "./table_editor.module.css";

/** Text editor for a single cell, mounted only while the cell is being edited.

The text is owned by the parent so that it survives the editor being remounted
in a different cell slot when rows or columns shift under it.
 */
export function CellEditor(props: {
    focus: FocusHandle;
    text: string;
    setText: (text: string) => void;
    validate: (text: string) => boolean;
    /** Possible values, shown in a popup while the editor is focused.

    Selecting a completion commits the cell through the completion itself.
     */
    completions?: Completion[];
    /** Whether the editor text is read-only, as for row references. */
    readOnly?: boolean;
    onCommit: (dir: MoveDirection) => void;
    onCancel: () => void;
}) {
    let finished = false;

    // Ignore completion or keyboard callbacks after the editor is removed.
    onCleanup(() => {
        finished = true;
    });

    const commit = (dir: MoveDirection) => {
        if (!finished) {
            finished = true;
            props.onCommit(dir);
        }
    };

    return (
        <TextInput
            class={styles.cellInput}
            classList={{ [styles.invalid]: !props.validate(props.text) }}
            text={props.text}
            setText={props.setText}
            focus={props.focus}
            readOnly={props.readOnly}
            completions={props.completions}
            filterCompletionsByText={!props.readOnly}
            exitUp={() => commit("up")}
            exitDown={() => commit("down")}
            createBelow={() => commit("down")}
            onComplete={() => {
                // The completion has committed the cell; don't also commit an
                // exit direction.
                finished = true;
            }}
            interceptKeyDown={(evt) => {
                if (evt.key === "Escape") {
                    finished = true;
                    props.onCancel();
                    return true;
                }
                return false;
            }}
        />
    );
}
