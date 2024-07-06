import { createEffect, createSignal, splitProps } from "solid-js";

import { IndexedMap } from "../util/indexed_map";
import { ObjectDecl, ObjectId } from "../model/model_judgments";
import { CellActions } from "./notebook_editor";
import { InlineInput, InlineInputOptions } from "./input";


export function ObjectDeclEditor(props: {
    object: ObjectDecl,
    modifyObject: (f: (decl: ObjectDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
}) {
    let nameRef!: HTMLInputElement;

    createEffect(() => {
        props.isActive && nameRef.focus();
    });

    return <div class="model-judgment object-declaration">
        <InlineInput ref={nameRef} placeholder="Unnamed"
            text={props.object.name}
            setText={(text) => {
                props.modifyObject((ob) => (ob.name = text));
            }}
            deleteBackward={props.actions.deleteBackward}
            deleteForward={props.actions.deleteForward}
            exitUp={props.actions.activateAbove}
            exitDown={props.actions.activateBelow}
        />
    </div>;
}

export function ObjectIdInput(allProps: {
    objectId: ObjectId | null;
    setObjectId: (id: ObjectId | null) => void;
    objectNameMap: IndexedMap<ObjectId,string>;
} & InlineInputOptions) {
    const [props, inputProps] = splitProps(allProps, [
        "objectId", "setObjectId", "objectNameMap",
    ]);

    const [text, setText] = createSignal("");

    createEffect(() => {
        let name = "";
        if (props.objectId) {
            name = props.objectNameMap.map.get(props.objectId) || "";
        }
        setText(name);
    });

    return <InlineInput
        text={text()}
        setText={(text) => {
            const possibleIds = props.objectNameMap.index.get(text);
            if (possibleIds && possibleIds.length > 0) {
                // TODO: Warn the user when the names are not unique.
                props.setObjectId(possibleIds[0]);
            } else if (text === "") {
                // To avoid erasing incompletely entered text, only reset the ID
                // to null when the text is also empty.
                props.setObjectId(null);
            }
            setText(text);
        }}
        invalid={text() !== (props.objectId ?
            props.objectNameMap.map.get(props.objectId) : "")}
        {...inputProps}
    />;
}
