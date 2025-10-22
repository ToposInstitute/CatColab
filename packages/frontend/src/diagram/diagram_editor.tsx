import { MultiProvider } from "@solid-primitives/context";
import { A, useParams } from "@solidjs/router";
import { Match, Show, Switch, createResource, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { DiagramJudgment, DiagramMorDecl, DiagramObDecl } from "catlog-wasm";
import { useApi } from "../api";
import { InlineInput } from "../components";
import { LiveModelContext, createModelLibraryWithApi } from "../model";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    newFormalCell,
} from "../notebook";
import { DocumentBreadcrumbs, DocumentLoadingScreen, Toolbar } from "../page";
import { type InstanceTypeMeta, TheoryLibraryContext } from "../theory";
import { PermissionsButton } from "../user";
import { LiveDiagramContext } from "./context";
import { DiagramMenu } from "./diagram_menu";
import { type LiveDiagramDocument, getLiveDiagram } from "./document";
import { DiagramMorphismCellEditor } from "./morphism_cell_editor";
import { DiagramObjectCellEditor } from "./object_cell_editor";
import { duplicateDiagramJudgment, newDiagramMorphismDecl, newDiagramObjectDecl } from "./types";

import "./diagram_editor.css";

export default function DiagramPage() {
    const params = useParams();

    const api = useApi();
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Must provide theory library as context to diagram page");
    const models = createModelLibraryWithApi(api, theories);

    const [liveDiagram] = createResource(
        () => params.ref,
        (refId) => getLiveDiagram(refId, api, models),
    );

    return (
        <Show when={liveDiagram()} fallback={<DocumentLoadingScreen />}>
            {(loadedDiagram) => <DiagramDocumentEditor liveDiagram={loadedDiagram()} />}
        </Show>
    );
}

export function DiagramDocumentEditor(props: {
    liveDiagram: LiveDiagramDocument;
}) {
    return (
        <div class="growable-container">
            <Toolbar>
                <DiagramMenu liveDiagram={props.liveDiagram} />
                <DocumentBreadcrumbs liveDoc={props.liveDiagram.liveDoc} />
                <span class="filler" />
                <PermissionsButton liveDoc={props.liveDiagram.liveDoc} />
            </Toolbar>
            <DiagramPane liveDiagram={props.liveDiagram} />
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
                        <A href={`/model/${liveModel().liveDoc.docRef?.refId}`}>
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
        default:
            judgment satisfies never;
    }
}
