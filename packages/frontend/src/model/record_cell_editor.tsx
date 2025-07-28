import { createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";
import { InlineInput, NameInput } from "../components";
import type { CellActions } from "../notebook";
import { focusInputWhen } from "../util/focus";
import { LiveModelContext } from "./context";
import type { RecordDecl } from "./types";

import "./record_cell_editor.css";

export function RecordCellEditor(props: {
    record: RecordDecl;
    modifyRecord: (f: (decl: RecordDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
}) {
    const [nameRef, setNameRef] = createSignal<HTMLInputElement>();
    focusInputWhen(nameRef, () => props.isActive);

    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const cssClasses = () => ["formal-judgment", "record-decl"];

    return (
        <div class={cssClasses().join(" ")}>
            <NameInput
                ref={setNameRef}
                placeholder="Unnamed"
                name={props.record.name}
                setName={(name) => {
                    props.modifyRecord((r) => {
                        r.name = name;
                    });
                }}
                deleteBackward={props.actions.deleteBackward}
                deleteForward={props.actions.deleteForward}
                exitBackward={props.actions.activateAbove}
                exitForward={props.actions.activateBelow}
                exitUp={props.actions.activateAbove}
                exitDown={props.actions.activateBelow}
                onFocus={props.actions.hasFocused}
            />
            <span>:</span>
            <InlineInput
                text={props.record.notebook_id}
                setText={(text) =>
                    props.modifyRecord((r) => {
                        r.notebook_id = text;
                    })
                }
                placeholder="notebook id"
            />
        </div>
    );
}
