import { useParams } from "@solidjs/router";
import { Match, Show, Switch, createResource, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { RepoContext, RpcContext, getLiveDoc } from "../api";
import { LiveModelContext, type ModelDocument, enlivenModelDocument } from "../model";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    cellShortcutModifier,
    newFormalCell,
} from "../notebook";
import { TheoryLibraryContext } from "../stdlib";
import type { InstanceTypeMeta } from "../theory";
import { type DiagramDocument, type LiveDiagramDocument, enlivenDiagramDocument } from "./document";
import { DiagramObjectCellEditor } from "./object_cell_editor";
import {
    type DiagramJudgment,
    type DiagramObjectDecl,
    newDiagramMorphismDecl,
    newDiagramObjectDecl,
} from "./types";

export default function DiagramPage() {
    const params = useParams();
    const refId = params.ref;
    invariant(refId, "Must provide document ref as parameter to diagram page");

    const rpc = useContext(RpcContext);
    const repo = useContext(RepoContext);
    const theories = useContext(TheoryLibraryContext);
    invariant(rpc && repo && theories, "Missing context for diagram page");

    const [liveDiagram] = createResource<LiveDiagramDocument>(async () => {
        const liveDoc = await getLiveDoc<DiagramDocument>(rpc, repo, refId);
        const { doc } = liveDoc;
        invariant(doc.type === "diagram", () => `Expected diagram, got type: ${doc.type}`);

        const modelReactiveDoc = await getLiveDoc<ModelDocument>(rpc, repo, doc.modelRef.refId);
        const liveModel = enlivenModelDocument(doc.modelRef.refId, modelReactiveDoc, theories);

        return enlivenDiagramDocument(refId, liveDoc, liveModel);
    });

    return (
        <Show when={liveDiagram()}>
            {(liveDiagram) => (
                <div class="growable-container">
                    <div class="notebook-container">
                        <DiagramNotebookEditor liveDiagram={liveDiagram()} />
                    </div>
                </div>
            )}
        </Show>
    );
}

/** Editor for a notebook defining a diagram in a model.
 */
export function DiagramNotebookEditor(props: {
    liveDiagram: LiveDiagramDocument;
}) {
    const liveDoc = () => props.liveDiagram.liveDoc;

    return (
        <LiveModelContext.Provider value={props.liveDiagram.liveModel}>
            <NotebookEditor
                handle={liveDoc().docHandle}
                path={["notebook"]}
                notebook={liveDoc().doc.notebook}
                changeNotebook={(f) => {
                    liveDoc().changeDoc((doc) => f(doc.notebook));
                }}
                formalCellEditor={DiagramCellEditor}
                cellConstructors={diagramCellConstructors(
                    props.liveDiagram.liveModel.theory()?.instanceTypes ?? [],
                )}
                cellLabel={judgmentLabel}
            />
        </LiveModelContext.Provider>
    );
}

/** Editor for a notebook cell in a diagram notebook.
 */
export function DiagramCellEditor(props: FormalCellEditorProps<DiagramJudgment>) {
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
        </Switch>
    );
}

function diagramCellConstructors(
    instanceTypes: InstanceTypeMeta[],
): CellConstructor<DiagramJudgment>[] {
    return instanceTypes.map((meta) => {
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
    });
}

function judgmentLabel(judgment: DiagramJudgment): string | undefined {
    const liveModel = useContext(LiveModelContext);
    const theory = liveModel?.theory();
    if (judgment.tag === "object") {
        return theory?.instanceObTypeMeta(judgment.obType)?.name;
    }
    if (judgment.tag === "morphism") {
        return theory?.instanceMorTypeMeta(judgment.morType)?.name;
    }
}
