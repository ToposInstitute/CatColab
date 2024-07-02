import { Doc } from "@automerge/automerge";
import { ModelJudgment } from "../model/model_judgments";
import { Notebook } from "../model/notebook";
import { NotebookEditor } from "./notebook_editor";

export function ModelJudgmentEditor(props: {
    content: ModelJudgment;
    modifyContent: (f: (content: ModelJudgment) => void) => void;
}) {
    if (props.content.tag == "object") {
        return <p>{props.content.name}</p>;
    } else if (props.content.tag == "morphism") {
        return <p>{props.content.name}</p>;
    }
}

export function ModelEditor(props: {
    notebook: Doc<Notebook<ModelJudgment>>;
    modifyNotebook: (f: (d: Notebook<ModelJudgment>) => void) => void;
}) {
    return (
        <NotebookEditor notebook={props.notebook} modifyNotebook={props.modifyNotebook}
            editFormalCell={ModelJudgmentEditor}/>
    );
}
