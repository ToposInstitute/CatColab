import { createEffect } from "solid-js";

import { IndexedMap } from "../util/indexed_map";
import { MorphismDecl, ObjectId } from "../model/model_judgments";
import { CellActions } from "./notebook_editor";
import { ObjectIdInput} from "./object_editor";
import { InlineInput } from "./input";

import "./morphism_editor.css";


export function MorphismDeclEditor(props: {
    morphism: MorphismDecl;
    modifyMorphism: (f: (decl: MorphismDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
    objectNameMap: IndexedMap<ObjectId,string>;
}) {
    let nameRef!: HTMLInputElement;
    let domRef!: HTMLInputElement;
    let codRef!: HTMLInputElement;

    createEffect(() => {
        props.isActive && nameRef.focus();
    });

    return <div class="model-judgment morphism-declaration">
        <InlineInput ref={nameRef} placeholder="Unnamed"
            text={props.morphism.name}
            setText={(text) => {
                props.modifyMorphism((mor) => (mor.name = text));
            }}
            deleteBackward={props.actions.deleteBackward}
            deleteForward={props.actions.deleteForward}
            exitUp={props.actions.activateAbove}
            exitDown={props.actions.activateBelow}
            exitRight={() => domRef.focus()}
        />
        <span>:</span>
        <ObjectIdInput ref={domRef} placeholder="..."
            objectId={props.morphism.dom}
            setObjectId={(id) => {
                props.modifyMorphism((mor) => (mor.dom = id));
            }}
            objectNameMap={props.objectNameMap}
            deleteBackward={() => nameRef.focus()}
            exitLeft={() => nameRef.focus()}
            exitRight={() => codRef.focus()}
        />
        <span>&LongRightArrow;</span>
        <ObjectIdInput ref={codRef} placeholder="..."
            objectId={props.morphism.cod}
            setObjectId={(id) => {
                props.modifyMorphism((mor) => (mor.cod = id));
            }}
            objectNameMap={props.objectNameMap}
            deleteBackward={() => domRef.focus()}
            exitLeft={() => domRef.focus()}
        />
    </div>;
}
