import { onMount } from "solid-js";
import { ModelJudgment, ObjectDecl } from "../model/model_judgments";
import { Notebook } from "../model/notebook";
import { NotebookEditor } from "./notebook_editor";

import "./model_editor.css";


function ObjectDeclEditor(props: {
    decl: ObjectDecl,
    modifyDecl: (f: (decl: ObjectDecl) => void) => void;
    deleteSelf: () => void;
}) {
    let ref!: HTMLInputElement;
    onMount(() => ref.focus());

    return (
        <div class="object-declaration">
            <input ref={ref} type="text"
            value={props.decl.name} placeholder="Unnamed"
            onInput={(evt) => {
                props.modifyDecl((decl) => (decl.name = evt.target.value));
            }}
            onKeyDown={(evt) => {
                if (evt.key == "Backspace" && props.decl.name == "") {
                    evt.preventDefault();
                    props.deleteSelf();
                }
            }}
            ></input>
        </div>
    );
}

function ModelJudgmentEditor(props: {
    content: ModelJudgment;
    modifyContent: (f: (content: ModelJudgment) => void) => void;
    deleteSelf: () => void;
}) {
    if (props.content.tag == "object") {
        return <ObjectDeclEditor
            decl={props.content}
            modifyDecl={(f) =>
                props.modifyContent((content) => {
                    f(content as ObjectDecl);
                })
            }
            deleteSelf={props.deleteSelf}
        />;
    } else if (props.content.tag == "morphism") {
        return <p>{props.content.name}</p>;
    }
}

export function ModelEditor(props: {
    notebook: Notebook<ModelJudgment>;
    modifyNotebook: (f: (d: Notebook<ModelJudgment>) => void) => void;
}) {
    return (
        <NotebookEditor notebook={props.notebook} modifyNotebook={props.modifyNotebook}
            makeFormalCellEditor={ModelJudgmentEditor}/>
    );
}
