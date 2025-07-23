import { createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { NameInput } from "../components";
import { ObInput } from "../model/object_input";
import type { CellActions } from "../notebook";
import { LiveDiagramContext } from "./context";
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
    const liveDiagram = useContext(LiveDiagramContext);
    invariant(liveDiagram, "Live diagram should be provided as context");

    const [activeInput, setActiveInput] = createSignal<DiagramObjectCellInput>("name");

    const theory = () => liveDiagram().liveModel.theory();

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
                placeholder={theory().modelObTypeMeta(props.decl.obType)?.name}
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
