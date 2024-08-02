import { createEffect, useContext } from "solid-js";

import { InlineInput } from "../components";
import type { CellActions } from "../notebook";
import { obClasses } from "./id_input";
import { TheoryContext } from "./model_context";
import type { ObjectDecl } from "./types";

import "./object_cell_editor.css";

/** Editor for an object declaration cell in a model.
 */
export function ObjectCellEditor(props: {
    object: ObjectDecl;
    modifyObject: (f: (decl: ObjectDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
}) {
    let nameRef!: HTMLInputElement;

    createEffect(() => {
        if (props.isActive) {
            nameRef.focus();
            nameRef.selectionStart = nameRef.selectionEnd = nameRef.value.length;
        }
    });

    const theory = useContext(TheoryContext);
    const cssClasses = (): string[] => [
        "object-decl",
        ...obClasses(theory?.(), props.object.obType),
    ];

    return (
        <div class={cssClasses().join(" ")}>
            <InlineInput
                ref={nameRef}
                placeholder="Unnamed"
                text={props.object.name}
                setText={(text) => {
                    props.modifyObject((ob) => {
                        ob.name = text;
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
        </div>
    );
}
