import { createMemo } from "solid-js";
import { Dynamic } from "solid-js/web";

import { IndexedMap, indexMap } from "../util/indexed_map";
import { ModelJudgment, MorphismDecl, ObjectDecl, ObjectId } from "../model/model_judgments";
import { Notebook } from "../model/notebook";
import { CellActions, NotebookEditor, NotebookEditorRef } from "./notebook_editor";
import { ObjectDeclEditor } from "./object_editor";
import { MorphismDeclEditor } from "./morphism_editor";


export function ModelJudgmentEditor(props: {
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
