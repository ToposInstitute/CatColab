import { createEffect, createSignal, splitProps, useContext } from "solid-js";

import type { ObId, ObType } from "catlog-wasm";
import { InlineInput, type InlineInputErrorStatus, type InlineInputOptions } from "../components";
import type { CellActions } from "../notebook";
import type { TheoryMeta } from "../theory";
import type { IndexedMap } from "../util/indexing";
import { TheoryContext } from "./model_context";
import type { ObjectDecl } from "./types";

import "./object_cell_editor.css";

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
        ...extraClasses(theory?.(), props.object.obType),
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

export function ObjectIdInput(
    allProps: {
        objectId: ObId | null;
        setObjectId: (id: ObId | null) => void;
        objectType?: ObType;
        objectIndex?: IndexedMap<ObId, string>;
        objectInvalid?: boolean;
    } & InlineInputOptions,
) {
    const [props, inputProps] = splitProps(allProps, [
        "objectId",
        "setObjectId",
        "objectIndex",
        "objectType",
        "objectInvalid",
    ]);

    const [text, setText] = createSignal("");

    createEffect(() => {
        let name = "";
        if (props.objectId) {
            name = props.objectIndex?.map.get(props.objectId) ?? "";
        }
        setText(name);
    });

    const handleNewText = (text: string) => {
        const possibleIds = props.objectIndex?.index.get(text);
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

    const isComplete = () => {
        const objectName = props.objectId ? props.objectIndex?.map.get(props.objectId) : "";
        return text() === objectName;
    };
    const status = (): InlineInputErrorStatus => {
        if (!isComplete()) {
            return "incomplete";
        }
        if (props.objectInvalid) {
            return "invalid";
        }
        return null;
    };

    const theory = useContext(TheoryContext);
    const cssClasses = () => extraClasses(theory?.(), props.objectType);

    return (
        <div class={cssClasses().join(" ")}>
            <InlineInput text={text()} setText={handleNewText} status={status()} {...inputProps} />
        </div>
    );
}

function extraClasses(theory: TheoryMeta | undefined, typ?: ObType): string[] {
    const typeMeta = typ ? theory?.getObTypeMeta(typ) : undefined;
    return [...(typeMeta?.cssClasses ?? []), ...(typeMeta?.textClasses ?? [])];
}
