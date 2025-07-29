import { createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";
import { InlineInput, NameInput } from "../components";
import type { CellActions } from "../notebook";
import { LiveModelContext } from "./context";

import "./instance_cell_editor.css";
import type { InstanceDecl } from "./types";

export function InstanceCellEditor(props: {
    decl: InstanceDecl;
    modifyDecl: (f: (decl: InstanceDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
}) {
    const [nameRef, setNameRef] = createSignal<HTMLInputElement>();

    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const cssClasses = () => ["formal-judgment", "record-decl"];

    return (
        <div class={cssClasses().join(" ")}>
            <NameInput
                ref={setNameRef}
                placeholder="Unnamed"
                name={props.decl.name}
                setName={(name) => {
                    props.modifyDecl((d) => {
                        d.name = name;
                    });
                }}
                deleteBackward={props.actions.deleteBackward}
                deleteForward={props.actions.deleteForward}
                exitBackward={props.actions.activateAbove}
                exitForward={props.actions.activateBelow}
                exitUp={props.actions.activateAbove}
                exitDown={props.actions.activateBelow}
                // onFocus={props.actions.hasFocused}
            />
            <span>:</span>
            <InlineInput
                text={props.decl.notebook_id}
                setText={(text) =>
                    props.modifyDecl((d) => {
                        d.notebook_id = text;
                    })
                }
                placeholder="notebook id"
            />
        </div>
    );
}
