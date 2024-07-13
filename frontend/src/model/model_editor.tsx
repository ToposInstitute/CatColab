import { DocHandle } from "@automerge/automerge-repo";
import { createMemo, Match, Switch } from "solid-js";

import { IndexedMap, indexMap } from "../util/indexed_map";
import { useDoc } from "../util/automerge_solid";

import { TheoryId, TheoryMeta } from "../theory";
import { ModelJudgment, MorphismDecl, newMorphismDecl, newObjectDecl, NotebookModel, ObjectDecl, ObjectId } from "./types";
import { CellActions, CellConstructor, newFormalCell, newRichTextCell, NotebookEditor } from "../notebook";
import { InlineInput } from "../notebook/inline_input";
import { ObjectNameMapContext } from "./model_context";
import { ObjectCellEditor } from "./object_cell_editor";
import { MorphismCellEditor } from "./morphism_cell_editor";

import "./model_editor.css";


/** Editor for a cell in a model of a discrete double theory.
 */
export function ModelCellEditor(props: {
    content: ModelJudgment;
    changeContent: (f: (content: ModelJudgment) => void) => void;
    isActive: boolean;
    actions: CellActions;
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
            />
        </Match>
        </Switch>
    );
}

/** Notebook-based editor for a model of a discrete double theory.
 */
export function ModelEditor(props: {
    handle: DocHandle<NotebookModel>,
    init: NotebookModel,
    theories: TheoryMeta[],
}) {
    const theoryIndex = createMemo<Map<TheoryId,number>>(() => {
        const map = new Map<TheoryId,number>();
        for (const [i, th] of props.theories.entries()) {
            map.set(th.id, i);
        }
        return map;
    });

    const [model, changeModel] = useDoc(() => props.handle, props.init);

    const objectNameMap = createMemo<IndexedMap<ObjectId,string>>(() => {
        const map = new Map<ObjectId,string>();
        for (const cell of model().notebook.cells) {
            if (cell.tag == "formal" && cell.content.tag == "object") {
                map.set(cell.content.id, cell.content.name);
            }
        }
        return indexMap(map);
    });

    const cellConstructors = () => {
        const id = model().theory;
        const i = id && theoryIndex().get(id);
        const th = typeof(i) === "number" ? props.theories[i] : undefined;
        return modelCellConstructors(th);
    }

    return (
        <div class="model-editor">
            <div class="model-title">
            <InlineInput text={model().name}
                setText={(text) => {
                    changeModel((model) => (model.name = text));
                }}
            />
            </div>
            <ObjectNameMapContext.Provider value={objectNameMap}>
                <NotebookEditor handle={props.handle} path={["notebook"]}
                    notebook={model().notebook}
                    changeNotebook={(f) => {
                        changeModel((model) => f(model.notebook));
                    }}
                    formalCellEditor={ModelCellEditor}
                    cellConstructors={cellConstructors()}
                />
            </ObjectNameMapContext.Provider>
        </div>
    );
}

type ModelCellConstructor = CellConstructor<ModelJudgment>;

function modelCellConstructors(theory?: TheoryMeta): ModelCellConstructor[] {
    // On Mac, the Alt/Option key remaps keys, whereas on other platforms
    // Control tends to be already bound in other shortcuts.
    const modifier = navigator.userAgent.includes("Mac") ? "Control" : "Alt";

    const result: ModelCellConstructor[] = [
        {
            name: "Text",
            shortcut: [modifier, "T"],
            construct: () => newRichTextCell(),
        }
    ];

    for (const typ of theory ? theory.types : []) {
        const {name, description, shortcut} = typ;
        result.push({
            name, description,
            shortcut: shortcut && [modifier, ...shortcut],
            construct: typ.tag === "ob_type" ?
                () => newFormalCell(newObjectDecl(typ.id)) :
                () => newFormalCell(newMorphismDecl(typ.id)),
        });
    }

    return result;
}
