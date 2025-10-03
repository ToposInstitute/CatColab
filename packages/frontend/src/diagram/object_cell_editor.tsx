import { createSignal } from "solid-js";

import { NameInput } from "catcolab-ui-components";
import type { DiagramObDecl } from "catlog-wasm";
import { ObInput } from "../model/object_input";
import type { CellActions } from "../notebook";
import type { Theory } from "../theory";

import "./object_cell_editor.css";

/** Editor an object declaration cell in a diagram in a model. */
export function DiagramObjectCellEditor(props: {
    decl: DiagramObDecl;
    modifyDecl: (f: (decl: DiagramObDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
    theory: Theory;
}) {
    const [activeInput, setActiveInput] = createSignal<DiagramObjectCellInput>("name");

    return (
        <div class="formal-judgment diagram-object-decl">
            <NameInput
                name={props.decl.name}
                setName={(name) => {
                    props.modifyDecl((decl) => {
                        decl.name = name;
                    });
                }}
                placeholder="Unnamed"
                deleteBackward={props.actions.deleteBackward}
                deleteForward={props.actions.deleteForward}
                exitUp={props.actions.activateAbove}
                exitDown={props.actions.activateBelow}
                exitRight={() => setActiveInput("overOb")}
                isActive={props.isActive && activeInput() === "name"}
                hasFocused={() => {
                    setActiveInput("name");
                    props.actions.hasFocused?.();
                }}
            />
            <span class="is-a" />
            <ObInput
                ob={props.decl.over}
                setOb={(ob) => {
                    props.modifyDecl((decl) => {
                        decl.over = ob;
                    });
                }}
                obType={props.decl.obType}
                placeholder={props.theory.modelObTypeMeta(props.decl.obType)?.name}
                exitUp={props.actions.activateAbove}
                exitDown={props.actions.activateBelow}
                exitLeft={() => setActiveInput("name")}
                isActive={props.isActive && activeInput() === "overOb"}
                hasFocused={() => {
                    setActiveInput("overOb");
                    props.actions.hasFocused?.();
                }}
            />
        </div>
    );
}

type DiagramObjectCellInput = "name" | "overOb";
