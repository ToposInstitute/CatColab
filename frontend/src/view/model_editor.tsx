import { createMemo, onMount } from "solid-js";
import { Dynamic } from "solid-js/web";

import { ModelJudgment, MorphismDecl, ObjectDecl, ObjectId } from "../model/model_judgments";
import { Notebook } from "../model/notebook";
import { NotebookEditor } from "./notebook_editor";
import { InlineInput } from "./input";

import "./model_editor.css";


function ObjectDeclEditor(props: {
    object: ObjectDecl,
    modifyObject: (f: (decl: ObjectDecl) => void) => void;
    deleteSelf: () => void;
}) {
    let nameRef!: HTMLInputElement;
    onMount(() => nameRef.focus());

    return <div class="object-declaration">
        <InlineInput ref={nameRef} placeholder="Unnamed"
            value={props.object.name}
            onInput={(evt) => {
                props.modifyObject((ob) => (ob.name = evt.target.value));
            }}
            onKeyDown={(evt) => {
                if (evt.key == "Backspace" && props.object.name == "") {
                    evt.preventDefault();
                    props.deleteSelf();
                }
            }}
        />
    </div>;
}

function MorphismDeclEditor(props: {
    morphism: MorphismDecl;
    modifyMorphism: (f: (decl: MorphismDecl) => void) => void;
    deleteSelf: () => void;
    objectNameMap: Map<ObjectId,string>;
}) {
    let nameRef!: HTMLInputElement;
    onMount(() => nameRef.focus());

    return <div class="morphism-declaration">
        <InlineInput ref={nameRef} placeholder="Unnamed"
            value={props.morphism.name}
            onInput={(evt) => {
                props.modifyMorphism((mor) => (mor.name = evt.target.value));
            }}
        />
        <span>:</span>
        <span>{props.objectNameMap.size}</span>
        <span>&LongRightArrow;</span>
    </div>;
}

function ModelJudgmentEditor(props: {
    content: ModelJudgment;
    modifyContent: (f: (content: ModelJudgment) => void) => void;
    deleteSelf: () => void;
    objectNameMap: Map<ObjectId,string>;
}) {
    const editors = {
        object: () => <ObjectDeclEditor
            object={props.content as ObjectDecl}
            modifyObject={(f) => props.modifyContent(
                (content) => f(content as ObjectDecl)
            )}
            deleteSelf={props.deleteSelf}
        />,
        morphism: () => <MorphismDeclEditor
            morphism={props.content as MorphismDecl}
            modifyMorphism={(f) => props.modifyContent(
                (content) => f(content as MorphismDecl)
            )}
            deleteSelf={props.deleteSelf}
            objectNameMap={props.objectNameMap}
        />,
    };
    return <Dynamic component={editors[props.content.tag]} />;
}

export function ModelEditor(props: {
    notebook: Notebook<ModelJudgment>;
    modifyNotebook: (f: (d: Notebook<ModelJudgment>) => void) => void;
}) {
    const objectNameMap = createMemo<Map<ObjectId,string>>(() => {
        const map = new Map<ObjectId,string>();
        for (const cell of props.notebook.cells) {
            if (cell.tag == "formal" && cell.content.tag == "object") {
                map.set(cell.content.id, cell.content.name);
            }
        }
        return map;
    });

    return (
        <NotebookEditor notebook={props.notebook}
            modifyNotebook={props.modifyNotebook}
            formalCellEditor={ModelJudgmentEditor}
            objectNameMap={objectNameMap()}/>
    );
}
