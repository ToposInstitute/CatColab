import { Match, Switch, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { InstantiatedModel, ModelJudgment, MorDecl, ObDecl } from "catlog-wasm";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    newFormalCell,
} from "../notebook";
import type { ModelTypeMeta } from "../theory";
import { LiveModelContext } from "./context";
import type { LiveModelDocument } from "./document";
import { InstantiationCellEditor } from "./instantiation_cell_editor";
import { MorphismCellEditor } from "./morphism_cell_editor";
import { ObjectCellEditor } from "./object_cell_editor";
import {
    duplicateModelJudgment,
    newInstantiatedModel,
    newMorphismDecl,
    newObjectDecl,
} from "./types";

/** Notebook editor for a model of a double theory.
 */
export function ModelNotebookEditor(props: { liveModel: LiveModelDocument }) {
    const liveDoc = () => props.liveModel.liveDoc;

    const cellConstructors = (): CellConstructor<ModelJudgment>[] => [
        {
            name: "Instantiate",
            description: "Instantiate an existing model into this one",
            shortcut: ["I"],
            construct() {
                return newFormalCell(newInstantiatedModel());
            },
        },
        ...(props.liveModel.theory()?.modelTypes ?? []).map(modelCellConstructor),
    ];

    return (
        <LiveModelContext.Provider value={() => props.liveModel}>
            <NotebookEditor
                handle={liveDoc().docHandle}
                path={["notebook"]}
                notebook={liveDoc().doc.notebook}
                changeNotebook={(f) => {
                    liveDoc().changeDoc((doc) => f(doc.notebook));
                }}
                formalCellEditor={ModelCellEditor}
                cellConstructors={cellConstructors()}
                cellLabel={judgmentLabel}
                duplicateCell={duplicateModelJudgment}
            />
        </LiveModelContext.Provider>
    );
}

/** Editor for a notebook cell in a model notebook. */
export function ModelCellEditor(props: FormalCellEditorProps<ModelJudgment>) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    return (
        <Switch>
            <Match when={props.content.tag === "object" && liveModel().theory()}>
                {(theory) => (
                    <ObjectCellEditor
                        object={props.content as ObDecl}
                        modifyObject={(f) => props.changeContent((content) => f(content as ObDecl))}
                        isActive={props.isActive}
                        actions={props.actions}
                        theory={theory()}
                    />
                )}
            </Match>
            <Match when={props.content.tag === "morphism" && liveModel().theory()}>
                {(theory) => (
                    <MorphismCellEditor
                        morphism={props.content as MorDecl}
                        modifyMorphism={(f) =>
                            props.changeContent((content) => f(content as MorDecl))
                        }
                        isActive={props.isActive}
                        actions={props.actions}
                        theory={theory()}
                    />
                )}
            </Match>
            <Match when={props.content.tag === "instantiation"}>
                <InstantiationCellEditor
                    instantiation={props.content as InstantiatedModel}
                    modifyInstantiation={(f) =>
                        props.changeContent((content) => f(content as InstantiatedModel))
                    }
                    isActive={props.isActive}
                    actions={props.actions}
                />
            </Match>
        </Switch>
    );
}

function modelCellConstructor(meta: ModelTypeMeta): CellConstructor<ModelJudgment> {
    const { tag, name, description, shortcut } = meta;
    return {
        name,
        description,
        shortcut,
        construct() {
            switch (tag) {
                case "ObType":
                    return newFormalCell(newObjectDecl(meta.obType));
                case "MorType":
                    return newFormalCell(newMorphismDecl(meta.morType));
                default:
                    throw tag satisfies never;
            }
        },
    };
}

function judgmentLabel(judgment: ModelJudgment): string | undefined {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel);
    const theory = liveModel().theory();

    switch (judgment.tag) {
        case "object":
            return theory?.modelObTypeMeta(judgment.obType)?.name;
        case "morphism":
            return theory?.modelMorTypeMeta(judgment.morType)?.name;
        case "instantiation":
            return theory?.name;
        default:
            judgment satisfies never;
    }
}
