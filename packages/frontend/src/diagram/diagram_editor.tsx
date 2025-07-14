import { MultiProvider } from "@solid-primitives/context";
import { Match, Show, Switch, createResource, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { DiagramJudgment } from "catlog-wasm";
import { LiveModelContext } from "../model";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    cellShortcutModifier,
    newFormalCell,
} from "../notebook";
import type { InstanceTypeMeta } from "../theory";
import { LiveDiagramContext } from "./context";
import { type LiveDiagramDocument, getLiveDiagram } from "./document";
import { DiagramMorphismCellEditor } from "./morphism_cell_editor";
import { DiagramObjectCellEditor } from "./object_cell_editor";
import {
    type DiagramMorphismDecl,
    type DiagramObjectDecl,
    duplicateDiagramJudgment,
    newDiagramMorphismDecl,
    newDiagramObjectDecl,
} from "./types";

/** Notebook editor for a diagram in a model.
 */
export function DiagramNotebookEditor(props: {
    liveDiagram: LiveDiagramDocument;
}) {
    const liveDoc = () => props.liveDiagram.liveDoc;
    const liveModel = () => props.liveDiagram.liveModel;

    const cellConstructors = () =>
        (liveModel().theory().instanceTypes ?? []).map(diagramCellConstructor);

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
    return (
        <Switch>
            <Match when={props.content.tag === "object"}>
                <DiagramObjectCellEditor
                    decl={props.content as DiagramObjectDecl}
                    modifyDecl={(f) =>
                        props.changeContent((content) => f(content as DiagramObjectDecl))
                    }
                    isActive={props.isActive}
                    actions={props.actions}
                />
            </Match>
            <Match when={props.content.tag === "morphism"}>
                <DiagramMorphismCellEditor
                    decl={props.content as DiagramMorphismDecl}
                    modifyDecl={(f) =>
                        props.changeContent((content) => f(content as DiagramMorphismDecl))
                    }
                    isActive={props.isActive}
                    actions={props.actions}
                />
            </Match>
        </Switch>
    );
}

function diagramCellConstructor(meta: InstanceTypeMeta): CellConstructor<DiagramJudgment> {
    const { name, description, shortcut } = meta;
    return {
        name,
        description,
        shortcut: shortcut && [cellShortcutModifier, ...shortcut],
        construct() {
            return meta.tag === "ObType"
                ? newFormalCell(newDiagramObjectDecl(meta.obType))
                : newFormalCell(newDiagramMorphismDecl(meta.morType));
        },
    };
}

function judgmentLabel(judgment: DiagramJudgment): string | undefined {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel);
    const theory = liveModel().theory();

    if (judgment.tag === "object") {
        return theory.instanceObTypeMeta(judgment.obType)?.name;
    }
    if (judgment.tag === "morphism") {
        return theory.instanceMorTypeMeta(judgment.morType)?.name;
    }
}
