import { DocHandle } from "@automerge/automerge-repo";
import { createMemo, createSignal, Match, Switch } from "solid-js";

import { IndexedMap, indexMap } from "../util/indexed_map";
import { ModelJudgment, MorphismDecl, ObjectDecl, ObjectId } from "./types";
import { Notebook, CellActions, NotebookEditor, NotebookEditorRef } from "../notebook";
import { ObjectCellEditor } from "./object_cell_editor";
import { MorphismCellEditor } from "./morphism_cell_editor";


/** Editor for a cell in a model of a discrete double theory.
 */
export function ModelCellEditor(props: {
    content: ModelJudgment;
    changeContent: (f: (content: ModelJudgment) => void) => void;
    isActive: boolean;
    actions: CellActions;
    objectNameMap: IndexedMap<ObjectId,string>;
}) {
    return (
        <Switch>
        <Match when={props.content.tag === "object"}>
            <ObjectCellEditor
                object={props.content as ObjectDecl}
                modifyObject={(f) => props.changeContent(
                    (content) => f(content as ObjectDecl)
                )}
                isActive={props.isActive} actions={props.actions}
            />
        </Match>
        <Match when={props.content.tag === "morphism"}>
            <MorphismCellEditor
                morphism={props.content as MorphismDecl}
                modifyMorphism={(f) => props.changeContent(
                    (content) => f(content as MorphismDecl)
                )}
                isActive={props.isActive} actions={props.actions}
                objectNameMap={props.objectNameMap}
            />
        </Match>
        </Switch>
    );
}

/** Notebook-based editor for a model of a discrete double theory.
 */
export function ModelEditor(props: {
    handle: DocHandle<Notebook<ModelJudgment>>,
    init: Notebook<ModelJudgment>,
    ref?: (ref: NotebookEditorRef<ModelJudgment>) => void;
}) {
    const [notebookRef, setNotebookRef] =
        createSignal<NotebookEditorRef<ModelJudgment>>();

    const objectNameMap = createMemo<IndexedMap<ObjectId,string>>(() => {
        const map = new Map<ObjectId,string>();
        const ref = notebookRef();
        for (const cell of ref ? ref.notebook().cells : []) {
            if (cell.tag == "formal" && cell.content.tag == "object") {
                map.set(cell.content.id, cell.content.name);
            }
        }
        return indexMap(map);
    });

    return (
       <NotebookEditor handle={props.handle} init={props.init}
            ref={(ref) => {
                setNotebookRef(ref);
                props.ref && props.ref(ref);
            }}
            formalCellEditor={ModelCellEditor}
            objectNameMap={objectNameMap()}
        />
    );
}
