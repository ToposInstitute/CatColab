import { onCleanup } from "solid-js";

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
    canExitBackward: boolean;
    onCommit: (dir: MoveDirection | "blur") => void;
    onCancel: () => void;
}) {
    let finished = false;

    // An editor unmounted by a concurrent change must not commit from the
    // `blur` that removing its focused input fires.
    onCleanup(() => {
        finished = true;
    });

    const commit = (dir: MoveDirection | "blur") => {
        if (!finished) {
            finished = true;
            props.onCommit(dir);
        }
    };

    // The focus directive in `TextInput` reports the focus state once on
    // mount, which must not be mistaken for losing focus.
    let hadFocus = false;

    return (
        <TextInput
            class={styles.cellInput}
            classList={{ [styles.invalid]: !props.validate(props.text) }}
            text={props.text}
            setText={props.setText}
            focus={props.focus}
            exitUp={() => commit("up")}
            exitDown={() => commit("down")}
            exitForward={() => commit("forward")}
            exitBackward={props.canExitBackward ? () => commit("backward") : undefined}
            createBelow={() => commit("down")}
            interceptKeyDown={(evt) => {
                if (evt.key === "Escape") {
                    finished = true;
                    props.onCancel();
                    return true;
                }
                return false;
            }}
            hasFocused={() => {
                hadFocus = true;
            }}
            hasBlurred={() => {
                if (hadFocus) {
                    commit("blur");
                }
            }}
        />
    );
}
