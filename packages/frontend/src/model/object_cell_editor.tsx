import { NameInput } from "catcolab-ui-components";
import type { ObDecl, ObType } from "catlog-wasm";
import type { CellActions } from "../notebook";
import type { Theory } from "../theory";

import "./object_cell_editor.css";

/** Editor for an object declaration cell in a model. */
export function ObjectCellEditor(props: {
    object: ObDecl;
    modifyObject: (f: (decl: ObDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
    theory: Theory;
}) {
    const cssClasses = () => [
        "formal-judgment",
        "object-decl",
        ...obClasses(props.theory, props.object.obType),
    ];

    return (
        <div class={cssClasses().join(" ")}>
            <NameInput
                placeholder="Unnamed"
                name={props.object.name}
                setName={(name) => {
                    props.modifyObject((ob) => {
                        ob.name = name;
                    });
                }}
                isActive={props.isActive}
                deleteBackward={props.actions.deleteBackward}
                deleteForward={props.actions.deleteForward}
                exitBackward={props.actions.activateAbove}
                exitForward={props.actions.activateBelow}
                exitUp={props.actions.activateAbove}
                exitDown={props.actions.activateBelow}
                hasFocused={props.actions.hasFocused}
            />
        </div>
    );
}

export function obClasses(theory: Theory, typ?: ObType): string[] {
    const typeMeta = typ ? theory.modelObTypeMeta(typ) : undefined;
    return [...(typeMeta?.cssClasses ?? []), ...(typeMeta?.textClasses ?? [])];
}
