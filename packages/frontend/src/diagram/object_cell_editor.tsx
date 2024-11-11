import { createEffect, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { InlineInput } from "../components";
import { LiveModelContext } from "../model";
import { ObInput } from "../model/object_input";
import type { CellActions } from "../notebook";
import type { DiagramObjectDecl } from "./types";

import "./object_cell_editor.css";

/** Editor an object declaration cell in a diagram in a model.
 */
export function DiagramObjectCellEditor(props: {
    decl: DiagramObjectDecl;
    modifyDecl: (f: (decl: DiagramObjectDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
}) {
    let nameRef!: HTMLInputElement;
    let obRef!: HTMLInputElement;

    createEffect(() => {
        if (props.isActive) {
            nameRef.focus();
            nameRef.selectionStart = nameRef.selectionEnd = nameRef.value.length;
        }
    });

    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    return (
        <div class="formal-judgment diagram-object-decl">
            <InlineInput
                ref={nameRef}
                text={props.decl.name}
                setText={(text) => {
                    props.modifyDecl((decl) => {
                        decl.name = text;
                    });
                }}
                placeholder="Unnamed"
                deleteBackward={props.actions.deleteBackward}
                deleteForward={props.actions.deleteForward}
                exitUp={props.actions.activateAbove}
                exitDown={props.actions.activateBelow}
                exitRight={() => obRef.focus()}
                onFocus={props.actions.hasFocused}
            />
            <span class="is-a" />
            <ObInput
                ref={obRef}
                ob={props.decl.over}
                setOb={(ob) => {
                    props.modifyDecl((decl) => {
                        decl.over = ob;
                    });
                }}
                obType={props.decl.obType}
                placeholder={liveModel.theory()?.modelObTypeMeta(props.decl.obType)?.name}
                exitUp={props.actions.activateAbove}
                exitDown={props.actions.activateBelow}
                exitLeft={() => nameRef.focus()}
                onFocus={props.actions.hasFocused}
            />
        </div>
    );
}
