import { createEffect, useContext } from "solid-js";

import { MorphismDecl } from "./types";
import { CellActions } from "../notebook";
import { InlineInput } from "../notebook/inline_input";
import { ObjectIndexContext, TheoryContext } from "./model_context";
import { ObjectIdInput} from "./object_cell_editor";


import "./morphism_cell_editor.css";


export function MorphismCellEditor(props: {
    morphism: MorphismDecl;
    modifyMorphism: (f: (decl: MorphismDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
}) {
    let nameRef!: HTMLInputElement;
    let domRef!: HTMLInputElement;
    let codRef!: HTMLInputElement;

    createEffect(() => {
        if (props.isActive) {
            nameRef.focus();
            nameRef.selectionStart = nameRef.selectionEnd = nameRef.value.length;
        }
    });

    const theory = useContext(TheoryContext);
    const objectIndex = useContext(ObjectIndexContext);

    return <div class="morphism-decl">
        <ObjectIdInput ref={domRef} placeholder="..."
            objectId={props.morphism.dom}
            setObjectId={(id) => {
                props.modifyMorphism((mor) => (mor.dom = id));
            }}
            objectType={theory?.()?.theory.src(props.morphism.type)}
            objectIndex={objectIndex && objectIndex()}
            deleteForward={() => nameRef.focus()}
            exitBackward={() => nameRef.focus()}
            exitForward={() => codRef.focus()}
            exitRight={() => nameRef.focus()}
            onFocus={props.actions.hasFocused}
        />
        <div class="morphism-decl-name-container">
        <div class="morphism-decl-name">
        <InlineInput ref={nameRef} placeholder="Unnamed"
            text={props.morphism.name}
            setText={(text) => {
                props.modifyMorphism((mor) => (mor.name = text));
            }}
            deleteBackward={props.actions.deleteBackward}
            deleteForward={props.actions.deleteForward}
            exitBackward={props.actions.activateAbove}
            exitForward={() => domRef.focus()}
            exitUp={props.actions.activateAbove}
            exitDown={props.actions.activateBelow}
            exitLeft={() => domRef.focus()}
            exitRight={() => codRef.focus()}
            onFocus={props.actions.hasFocused}
        />
        </div>
        <div class="morphism-decl-arrow"></div>
        </div>
        <ObjectIdInput ref={codRef} placeholder="..."
            objectId={props.morphism.cod}
            setObjectId={(id) => {
                props.modifyMorphism((mor) => (mor.cod = id));
            }}
            objectType={theory?.()?.theory.tgt(props.morphism.type)}
            objectIndex={objectIndex && objectIndex()}
            deleteBackward={() => nameRef.focus()}
            exitBackward={() => domRef.focus()}
            exitForward={props.actions.activateBelow}
            exitLeft={() => nameRef.focus()}
            onFocus={props.actions.hasFocused}
        />
    </div>;
}
