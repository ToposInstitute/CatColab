import { MultiProvider } from "@solid-primitives/context";
import { A, useNavigate, useParams } from "@solidjs/router";
import { Match, Show, Switch, createResource, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { createAnalysis } from "../analysis/document";
import { useApi } from "../api";
import { IconButton, InlineInput } from "../components";
import { LiveModelContext } from "../model";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    cellShortcutModifier,
    newFormalCell,
} from "../notebook";
import { BrandedToolbar } from "../page";
import { TheoryLibraryContext } from "../stdlib";
import type { InstanceTypeMeta } from "../theory";
import { MaybePermissionsButton } from "../user";
import { LiveDiagramContext } from "./context";
import { type LiveDiagramDocument, getLiveDiagram } from "./document";
import { DiagramMorphismCellEditor } from "./morphism_cell_editor";
import { DiagramObjectCellEditor } from "./object_cell_editor";
import {
    type DiagramJudgment,
    type DiagramMorphismDecl,
    type DiagramObjectDecl,
    newDiagramMorphismDecl,
    newDiagramObjectDecl,
} from "./types";

import "./diagram_editor.css";

import ChartSpline from "lucide-solid/icons/chart-spline";

export default function DiagramPage() {
    const params = useParams();
    const refId = params.ref;
    invariant(refId, "Must provide document ref as parameter to diagram page");

    const api = useApi();
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Must provide theory library as context to diagram page");

    const [liveDiagram] = createResource(() => getLiveDiagram(refId, api, theories));

    return <DiagramDocumentEditor liveDiagram={liveDiagram()} />;
}

export function DiagramDocumentEditor(props: {
    liveDiagram?: LiveDiagramDocument;
}) {
    const api = useApi();
    const navigate = useNavigate();

    const onCreateAnalysis = async (diagramRefId: string) => {
        const newRef = await createAnalysis("diagram", diagramRefId, api);
        navigate(`/analysis/${newRef}`);
    };

    return (
        <div class="growable-container">
            <BrandedToolbar>
                <MaybePermissionsButton permissions={props.liveDiagram?.liveDoc.permissions} />
                <IconButton
                    onClick={() => props.liveDiagram && onCreateAnalysis(props.liveDiagram.refId)}
                    tooltip="Analyze this diagram"
                >
                    <ChartSpline />
                </IconButton>
            </BrandedToolbar>
            <Show when={props.liveDiagram}>
                {(liveDiagram) => <DiagramPane liveDiagram={liveDiagram()} />}
            </Show>
        </div>
    );
}

/** Pane containing a diagram notebook plus a header for the title and model. */
export function DiagramPane(props: {
    liveDiagram: LiveDiagramDocument;
}) {
    const liveDoc = () => props.liveDiagram.liveDoc;
    const liveModel = () => props.liveDiagram.liveModel;

    return (
        <div class="notebook-container">
            <div class="diagram-head">
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
                <div class="instance-of">
                    <div class="name">{liveModel().theory()?.instanceOfName}</div>
                    <div class="model">
                        <A href={`/model/${liveModel().refId}`}>
                            {liveModel().liveDoc.doc.name || "Untitled"}
                        </A>
                    </div>
                </div>
            </div>
            <DiagramNotebookEditor liveDiagram={props.liveDiagram} />
        </div>
    );
}

/** Notebook editor for a diagram in a model.
 */
export function DiagramNotebookEditor(props: {
    liveDiagram: LiveDiagramDocument;
}) {
    const liveDoc = () => props.liveDiagram.liveDoc;
    const liveModel = () => props.liveDiagram.liveModel;

    const cellConstructors = () =>
        (liveModel().theory()?.instanceTypes ?? []).map(diagramCellConstructor);

    return (
        <MultiProvider
            values={[
                [LiveModelContext, liveModel()],
                [LiveDiagramContext, props.liveDiagram],
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
    const theory = liveModel?.theory();
    if (judgment.tag === "object") {
        return theory?.instanceObTypeMeta(judgment.obType)?.name;
    }
    if (judgment.tag === "morphism") {
        return theory?.instanceMorTypeMeta(judgment.morType)?.name;
    }
}
