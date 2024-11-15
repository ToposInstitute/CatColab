import { useContext } from "solid-js";
import invariant from "tiny-invariant";

import { InlineInput } from "../components";
import { ObInput } from "../model/object_input";
import type { CellActions } from "../notebook";
import { focusInputWhen } from "../util/focus";
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
    let nameRef!: HTMLInputElement;
    let obRef!: HTMLInputElement;
    focusInputWhen(
        () => nameRef,
        () => props.isActive,
    );

    const liveDiagram = useContext(LiveDiagramContext);
    invariant(liveDiagram, "Live diagram should be provided as context");
    const theory = () => liveDiagram.liveModel.theory();

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
                placeholder={theory()?.modelObTypeMeta(props.decl.obType)?.name}
                exitUp={props.actions.activateAbove}
                exitDown={props.actions.activateBelow}
                exitLeft={() => nameRef.focus()}
                onFocus={props.actions.hasFocused}
            />
        </div>
    );
}
