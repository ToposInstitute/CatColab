import { createEffect, createMemo, createSignal, splitProps } from "solid-js";
import { Dynamic } from "solid-js/web";

import { IndexedMap, indexMap } from "../util/indexed_map";
import { ModelJudgment, MorphismDecl, ObjectDecl, ObjectId } from "../model/model_judgments";
import { Notebook } from "../model/notebook";
import { CellActions, NotebookEditor, NotebookEditorRef } from "./notebook_editor";
import { InlineInput, InlineInputOptions } from "./input";

import "./model_editor.css";


function ObjectDeclEditor(props: {
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

function ObjectIdInput(allProps: {
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
        {...inputProps}
    />;
}

function MorphismDeclEditor(props: {
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

function ModelJudgmentEditor(props: {
    content: ModelJudgment;
    modifyContent: (f: (content: ModelJudgment) => void) => void;
    isActive: boolean;
    actions: CellActions;
    objectNameMap: IndexedMap<ObjectId,string>;
}) {
    const editors = {
        object: () => <ObjectDeclEditor
            object={props.content as ObjectDecl}
            modifyObject={(f) => props.modifyContent(
                (content) => f(content as ObjectDecl)
            )}
            isActive={props.isActive} actions={props.actions}
        />,
        morphism: () => <MorphismDeclEditor
            morphism={props.content as MorphismDecl}
            modifyMorphism={(f) => props.modifyContent(
                (content) => f(content as MorphismDecl)
            )}
            isActive={props.isActive} actions={props.actions}
            objectNameMap={props.objectNameMap}
        />,
    };
    return <Dynamic component={editors[props.content.tag]} />;
}

export function ModelEditor(props: {
    notebook: Notebook<ModelJudgment>;
    modifyNotebook: (f: (d: Notebook<ModelJudgment>) => void) => void;
    ref?: (ref: NotebookEditorRef<ModelJudgment>) => void;
}) {
    const objectNameMap = createMemo<IndexedMap<ObjectId,string>>(() => {
        const map = new Map<ObjectId,string>();
        for (const cell of props.notebook.cells) {
            if (cell.tag == "formal" && cell.content.tag == "object") {
                map.set(cell.content.id, cell.content.name);
            }
        }
        return indexMap(map);
    });

    return (
        <NotebookEditor ref={props.ref}
            notebook={props.notebook}
            modifyNotebook={props.modifyNotebook}
            formalCellEditor={ModelJudgmentEditor}
            objectNameMap={objectNameMap()}/>
    );
}
