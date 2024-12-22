import { useParams } from "@solidjs/router";
import { Match, Show, Switch, createResource, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { useApi } from "../api";
import { InlineInput } from "../components";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    cellShortcutModifier,
    newFormalCell,
} from "../notebook";
import { TheoryHelpButton, Toolbar } from "../page";
import { TheoryLibraryContext } from "../stdlib";
import type { ModelTypeMeta } from "../theory";
import { MaybePermissionsButton } from "../user";
import { LiveModelContext } from "./context";
import { type LiveModelDocument, getLiveModel } from "./document";
import { ModelMenu } from "./model_menu";
import { MorphismCellEditor } from "./morphism_cell_editor";
import { ObjectCellEditor } from "./object_cell_editor";
import { TheorySelectorDialog } from "./theory_selector";
import {
    type ModelJudgment,
    type MorphismDecl,
    type ObjectDecl,
    duplicateModelJudgment,
    newMorphismDecl,
    newObjectDecl,
} from "./types";

import "./model_editor.css";

export default function ModelPage() {
    const api = useApi();
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Must provide theory library as context to model page");

    const params = useParams();

    const [liveModel] = createResource(
        () => params.ref,
        (refId) => getLiveModel(refId, api, theories),
    );

    return <ModelDocumentEditor liveModel={liveModel()} />;
}

export function ModelDocumentEditor(props: {
    liveModel?: LiveModelDocument;
}) {
    return (
        <div class="growable-container">
            <Toolbar>
                <ModelMenu liveModel={props.liveModel} />
                <span class="filler" />
                <TheoryHelpButton theory={props.liveModel?.theory()} />
                <MaybePermissionsButton permissions={props.liveModel?.liveDoc.permissions} />
            </Toolbar>
            <Show when={props.liveModel}>
                {(liveModel) => <ModelPane liveModel={liveModel()} />}
            </Show>
        </div>
    );
}

/** Pane containing a model notebook plus a header with the title and theory.
 */
export function ModelPane(props: {
    liveModel: LiveModelDocument;
}) {
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories should be provided as context");

    const liveDoc = () => props.liveModel.liveDoc;

    return (
        <div class="notebook-container">
            <div class="model-head">
                <div class="title">
                    <InlineInput
                        text={liveDoc().doc.name}
                        setText={(text) => {
                            liveDoc().changeDoc((doc) => {
                                doc.name = text;
                            });
                        }}
                        placeholder="Untitled"
                    />
                </div>
                <TheorySelectorDialog
                    theory={props.liveModel.theory()}
                    setTheory={(id) => {
                        liveDoc().changeDoc((model) => {
                            model.theory = id;
                        });
                    }}
                    theories={theories}
                    disabled={liveDoc().doc.notebook.cells.some((cell) => cell.tag === "formal")}
                />
            </div>
            <ModelNotebookEditor liveModel={props.liveModel} />
        </div>
    );
}

/** Notebook editor for a model of a double theory.
 */
export function ModelNotebookEditor(props: {
    liveModel: LiveModelDocument;
}) {
    const liveDoc = () => props.liveModel.liveDoc;

    const cellConstructors = () =>
        (props.liveModel.theory()?.modelTypes ?? []).map(modelCellConstructor);

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

/** Editor for a notebook cell in a model notebook.
 */
function ModelCellEditor(props: FormalCellEditorProps<ModelJudgment>) {
    return (
        <Switch>
            <Match when={props.content.tag === "object"}>
                <ObjectCellEditor
                    object={props.content as ObjectDecl}
                    modifyObject={(f) => props.changeContent((content) => f(content as ObjectDecl))}
                    isActive={props.isActive}
                    actions={props.actions}
                />
            </Match>
            <Match when={props.content.tag === "morphism"}>
                <MorphismCellEditor
                    morphism={props.content as MorphismDecl}
                    modifyMorphism={(f) =>
                        props.changeContent((content) => f(content as MorphismDecl))
                    }
                    isActive={props.isActive}
                    actions={props.actions}
                />
            </Match>
        </Switch>
    );
}

function modelCellConstructor(meta: ModelTypeMeta): CellConstructor<ModelJudgment> {
    const { name, description, shortcut } = meta;
    return {
        name,
        description,
        shortcut: shortcut && [cellShortcutModifier, ...shortcut],
        construct() {
            return meta.tag === "ObType"
                ? newFormalCell(newObjectDecl(meta.obType))
                : newFormalCell(newMorphismDecl(meta.morType));
        },
    };
}

function judgmentLabel(judgment: ModelJudgment): string | undefined {
    const liveModel = useContext(LiveModelContext);
    const theory = liveModel?.().theory();
    if (judgment.tag === "object") {
        return theory?.modelObTypeMeta(judgment.obType)?.name;
    }
    if (judgment.tag === "morphism") {
        return theory?.modelMorTypeMeta(judgment.morType)?.name;
    }
}
