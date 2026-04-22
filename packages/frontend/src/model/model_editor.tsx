import { Match, Switch, useContext } from "solid-js";
import { Dynamic } from "solid-js/web";
import invariant from "tiny-invariant";

import { Model, Nb } from "catcolab-document-methods";
import type { InstantiatedModel, ModelJudgment, MorDecl, ObDecl } from "catcolab-document-types";
import { type CellConstructor, type FormalCellEditorProps, NotebookEditor } from "../notebook";
import { TheoryLibraryContext, type ModelTypeMeta, type Theory } from "../theory";
import { LiveModelContext } from "./context";
import type { LiveModelDoc } from "./document";
import { InstantiationCellEditor } from "./instantiation_cell_editor";

/** Notebook editor for a model of a double theory.
 */
export function ModelNotebookEditor(props: { liveModel: LiveModelDoc }) {
    const liveDoc = () => props.liveModel.liveDoc;

    const cellConstructors = () => {
        const theory = props.liveModel.theory();
        return theory ? modelCellConstructors(theory) : [];
    };

    // oxlint-disable solid/reactivity -- Context.Provider value getter is reactive
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
                duplicateCell={Model.duplicateModelJudgment}
            />
        </LiveModelContext.Provider>
    );
}

/** Editor for a notebook cell in a model notebook. */
export function ModelCellEditor(props: FormalCellEditorProps<ModelJudgment>) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");
    const theories = useContext(TheoryLibraryContext);

    const editorOverrides = () => {
        const variantId = liveModel().liveDoc.doc.editorVariant;
        return variantId && theories ? theories.getEditorOverrides(variantId) : undefined;
    };

    return (
        <Switch>
            <Match when={props.content.tag === "object" && liveModel().theory()}>
                {(theory) => {
                    const obDecl = () => props.content as ObDecl;
                    const editor = () =>
                        editorOverrides()?.obEditors?.get(obDecl().obType) ??
                        theory().modelObTypeMeta(obDecl().obType)?.editor;
                    return (
                        <Dynamic
                            component={editor()}
                            object={obDecl()}
                            modifyObject={(f: (decl: ObDecl) => void) =>
                                props.changeContent((content) => f(content as ObDecl))
                            }
                            isActive={props.isActive}
                            actions={props.actions}
                            theory={theory()}
                        />
                    );
                }}
            </Match>
            <Match when={props.content.tag === "morphism" && liveModel().theory()}>
                {(theory) => {
                    const morDecl = () => props.content as MorDecl;
                    const editor = () =>
                        editorOverrides()?.morEditors?.get(morDecl().morType) ??
                        theory().modelMorTypeMeta(morDecl().morType)?.editor;
                    return (
                        <Dynamic
                            component={editor()}
                            morphism={morDecl()}
                            modifyMorphism={(f: (decl: MorDecl) => void) =>
                                props.changeContent((content) => f(content as MorDecl))
                            }
                            isActive={props.isActive}
                            actions={props.actions}
                            theory={theory()}
                        />
                    );
                }}
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

function modelCellConstructors(theory: Theory): CellConstructor<ModelJudgment>[] {
    const constructors: CellConstructor<ModelJudgment>[] = [];
    constructors.push({
        name: "Instantiate",
        description: "Instantiate an existing model into this one",
        shortcut: ["I"],
        construct() {
            return Nb.newFormalCell(Model.newInstantiatedModel());
        },
    });
    for (const meta of theory.modelTypes ?? []) {
        constructors.push(modelCellConstructor(meta));
    }
    return constructors;
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
                    return Nb.newFormalCell(Model.newObjectDecl(meta.obType));
                case "MorType":
                    return Nb.newFormalCell(Model.newMorphismDecl(meta.morType));
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
        case "equation":
            return "Equation";
        default:
            judgment satisfies never;
    }
}
