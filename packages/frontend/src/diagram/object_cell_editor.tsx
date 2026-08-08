import { NameInput, type FocusHandle, useChildFocus } from "catcolab-ui-components";

import type { DiagramObDecl } from "catlog-wasm";
import { ObInput } from "../model/object_input";
import type { CellActions } from "../notebook";
import type { Theory } from "../theory";

import "./object_cell_editor.css";

/** Editor an object declaration cell in a diagram in a model. */
export function DiagramObjectCellEditor(props: {
    decl: DiagramObDecl;
    modifyDecl: (f: (decl: DiagramObDecl) => void) => void;
    focus: FocusHandle;
    actions: CellActions;
    theory: Theory;
}) {
    // oxlint-disable-next-line solid/reactivity -- Focus handles are stable for a mounted cell.
    const focus = useChildFocus<DiagramObjectCellInput>(props.focus, { default: "name" });

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
                exitRight={() => focus.setActiveChild("overOb")}
                exitForward={() => focus.setActiveChild("overOb")}
                focus={focus.childFocus("name")}
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
                exitLeft={() => focus.setActiveChild("name")}
                exitBackward={() => focus.setActiveChild("name")}
                focus={focus.childFocus("overOb")}
            />
        </div>
    );
}

type DiagramObjectCellInput = "name" | "overOb";
