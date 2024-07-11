import { createEffect, createSignal, splitProps } from "solid-js";

import { IndexedMap } from "../util/indexed_map";
import { ObjectDecl, ObjectId } from "./types";
import { CellActions } from "../notebook";
import { InlineInput, InlineInputOptions } from "../notebook/inline_input";


export function ObjectCellEditor(props: {
    object: ObjectDecl,
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

    return <div class="object-decl">
        <InlineInput ref={nameRef} placeholder="Unnamed"
            text={props.object.name}
            setText={(text) => {
                props.modifyObject((ob) => (ob.name = text));
            }}
            deleteBackward={props.actions.deleteBackward}
            deleteForward={props.actions.deleteForward}
            exitBackward={props.actions.activateAbove}
            exitForward={props.actions.activateBelow}
            exitUp={props.actions.activateAbove}
            exitDown={props.actions.activateBelow}
            onFocus={props.actions.hasFocused}
        />
    </div>;
}

export function ObjectIdInput(allProps: {
    objectId: ObjectId | null;
    setObjectId: (id: ObjectId | null) => void;
    objectNameMap?: IndexedMap<ObjectId,string>;
} & InlineInputOptions) {
    const [props, inputProps] = splitProps(allProps, [
        "objectId", "setObjectId", "objectNameMap",
    ]);

    const [text, setText] = createSignal("");

    createEffect(() => {
        let name = "";
        if (props.objectId) {
            name = props.objectNameMap?.map.get(props.objectId) || "";
        }
        setText(name);
    });

    const handleNewText = (text: string) => {
        const possibleIds = props.objectNameMap?.index.get(text);
        if (possibleIds && possibleIds.length > 0) {
            // TODO: Warn the user when the names are not unique.
            props.setObjectId(possibleIds[0]);
        } else if (text === "") {
            // To avoid erasing incompletely entered text, only reset the ID
            // to null when the text is also empty.
            props.setObjectId(null);
        }
        setText(text);
    };

    const isValid = () => {
        const objectName = props.objectId ?
            props.objectNameMap?.map.get(props.objectId) : "";
        return text() === objectName;
    };

    return <InlineInput text={text()} setText={handleNewText}
            invalid={!isValid()} {...inputProps} />;
}