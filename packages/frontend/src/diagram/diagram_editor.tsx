import { MultiProvider } from "@solid-primitives/context";
import { Match, Switch, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { DiagramJudgment, DiagramMorDecl, DiagramObDecl } from "catlog-wasm";
import { LiveModelContext } from "../model";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    newFormalCell,
} from "../notebook";
import type { InstanceTypeMeta } from "../theory";
import { LiveDiagramContext } from "./context";
import type { LiveDiagramDoc } from "./document";
import { DiagramMorphismCellEditor } from "./morphism_cell_editor";
import { DiagramObjectCellEditor } from "./object_cell_editor";
import { duplicateDiagramJudgment, newDiagramMorphismDecl, newDiagramObjectDecl } from "./types";

/** Notebook editor for a diagram in a model.
 */
export function DiagramNotebookEditor(props: { liveDiagram: LiveDiagramDoc }) {
    const liveDoc = () => props.liveDiagram.liveDoc;
    const liveModel = () => props.liveDiagram.liveModel;

    const cellConstructors = () =>
        (liveModel().theory()?.instanceTypes ?? []).map(diagramCellConstructor);

    return (
        <MultiProvider
            values={[
                [LiveModelContext, liveModel],
                [LiveDiagramContext, () => props.liveDiagram],
            ]}
        >
            <NotebookEditor
                handle={liveDoc().docHandle}
                path={["notebook"]}
                notebook={liveDoc().doc.notebook}
                changeNotebook={(f) => {
                    liveDoc().changeDoc((doc) => f(doc.notebook));
                }}
                formalCellEditor={DiagramCellEditor}
                cellConstructors={cellConstructors()}
                cellLabel={judgmentLabel}
                duplicateCell={duplicateDiagramJudgment}
            />
        </MultiProvider>
    );
}

/** Editor for a notebook cell in a diagram notebook.
 */
function DiagramCellEditor(props: FormalCellEditorProps<DiagramJudgment>) {
    const liveDiagram = useContext(LiveDiagramContext);
    invariant(liveDiagram, "Live diagram should be provided as context");

    return (
        <Switch>
            <Match when={props.content.tag === "object" && liveDiagram().liveModel.theory()}>
                {(theory) => (
                    <DiagramObjectCellEditor
                        decl={props.content as DiagramObDecl}
                        modifyDecl={(f) =>
                            props.changeContent((content) => f(content as DiagramObDecl))
                        }
                        isActive={props.isActive}
                        actions={props.actions}
                        theory={theory()}
                    />
                )}
            </Match>
            <Match when={props.content.tag === "morphism" && liveDiagram().liveModel.theory()}>
                {(theory) => (
                    <DiagramMorphismCellEditor
                        decl={props.content as DiagramMorDecl}
                        modifyDecl={(f) =>
                            props.changeContent((content) => f(content as DiagramMorDecl))
                        }
                        isActive={props.isActive}
                        actions={props.actions}
                        theory={theory()}
                    />
                )}
            </Match>
        </Switch>
    );
}

function diagramCellConstructor(meta: InstanceTypeMeta): CellConstructor<DiagramJudgment> {
    const { tag, name, description, shortcut } = meta;
    return {
        name,
        description,
        shortcut,
        construct() {
            switch (tag) {
                case "ObType":
                    return newFormalCell(newDiagramObjectDecl(meta.obType));
                case "MorType":
                    return newFormalCell(newDiagramMorphismDecl(meta.morType));
                default:
                    throw tag satisfies never;
            }
        },
    };
}

function judgmentLabel(judgment: DiagramJudgment): string | undefined {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel);
    const theory = liveModel().theory();

    switch (judgment.tag) {
        case "object":
            return theory?.instanceObTypeMeta(judgment.obType)?.name;
        case "morphism":
            return theory?.instanceMorTypeMeta(judgment.morType)?.name;
        case "equation":
            return "Equation";
        default:
            judgment satisfies never;
    }
}
