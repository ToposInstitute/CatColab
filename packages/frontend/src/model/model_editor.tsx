import { useNavigate, useParams } from "@solidjs/router";
import { For, Match, Show, Switch, createResource, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { ModelJudgment } from "catlog-wasm";
import { useApi } from "../api";
import { InlineInput } from "../components";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    cellShortcutModifier,
    newFormalCell,
} from "../notebook";
import {
    AnyLiveDocument,
    DocumentBreadcrumbs,
    DocumentLoadingScreen,
    DocumentMenu,
    getLiveDocument,
    TheoryHelpButton,
} from "../page";
import { TheoryLibraryContext } from "../stdlib";
import type { ModelTypeMeta } from "../theory";
import { PermissionsButton } from "../user";
import { LiveModelContext } from "./context";
import { type LiveModelDocument } from "./document";
import { MorphismCellEditor } from "./morphism_cell_editor";
import { ObjectCellEditor } from "./object_cell_editor";
import { TheorySelectorDialog } from "./theory_selector";
import {
    type MorphismDecl,
    type ObjectDecl,
    duplicateModelJudgment,
    newMorphismDecl,
    newObjectDecl,
} from "./types";

import "./model_editor.css";
import { Layout } from "../page/layout";
import { RefStub } from "catcolab-api";
import { DiagramPane } from "../diagram/diagram_editor";
import { AnalysisNotebookEditor } from "../analysis/analysis_editor";

export default function ModelPage() {
    const api = useApi();
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Must provide theory library as context to model page");

    const params = useParams();

    const [liveModel] = createResource(
        () => params.ref,
        (refId) => getLiveDocument(refId, api, theories, params.kind as any),
    );

    return (
        <Show when={liveModel()} fallback={<DocumentLoadingScreen />}>
            {(liveModel) => (
                <Layout
                    toolbarContents={
                        <>
                            <DocumentBreadcrumbs document={liveModel()} />
                            <span class="filler" />
                            <PermissionsButton
                                permissions={liveModel().liveDoc.permissions}
                                refId={liveModel().refId}
                            />
                        </>
                    }
                    sidebarContents={
                        <>
                            <DocumentMenu liveDocument={liveModel()} />
                            <RelatedItems refId={params.ref!} liveDocument={liveModel()} />
                        </>
                    }
                >
                    <DocumentPane liveDocument={liveModel()} />
                </Layout>
            )}
        </Show>
    );
}

function DocumentPane(props: { liveDocument: AnyLiveDocument }) {
    console.log(props.liveDocument.type === "analysis");
    return (
        <Switch>
            <Match when={props.liveDocument.type === "model" && props.liveDocument}>
                {(liveModel) => <ModelPane liveModel={liveModel()} />}
            </Match>
            <Match when={props.liveDocument.type === "diagram" && props.liveDocument}>
                {(liveDiagram) => <DiagramPane liveDiagram={liveDiagram()} />}
            </Match>
            <Match when={props.liveDocument.type === "analysis" && props.liveDocument}>
                {(liveAnalysis) => <AnalysisNotebookEditor liveAnalysis={liveAnalysis()} />}
            </Match>
        </Switch>
    );
}

// <TheoryHelpButton theory={liveModel().theory()} />
function RelatedItems(props: {
    refId: string;
    liveDocument: AnyLiveDocument;
}) {
    console.log(props.refId);
    const api = useApi();
    const [data] = createResource(
        () => props.refId,
        async (refId) => {
            const results = await api.rpc.search_ref_stubs.query({
                ownerUsernameQuery: null,
                refNameQuery: null,
                includePublicDocuments: true,
                searcherMinLevel: null,
                limit: 100,
                offset: 0,
                parentRefId: refId,
            });

            if (results.tag != "Ok") {
                throw "couldn't load results";
            }

            return {
                descendantItems: results.content.items,
            };
        },
    );

    return (
        <Show when={data()} fallback={<div>loading</div>}>
            {(data) => (
                <>
                    <CurrentItem liveDocument={props.liveDocument} />
                    <For each={data().descendantItems}>
                        {(stub) => <RelatedItem stub={stub} indent={1} />}
                    </For>
                </>
            )}
        </Show>
    );
}

function CurrentItem(props: {
    liveDocument: AnyLiveDocument;
}) {
    return <div class="related-item">{props.liveDocument.liveDoc.doc.name || "Untitled"}</div>;
}

function RelatedItem(props: { stub: RefStub; indent: number }) {
    const name = props.stub.name || "Untitled";

    const navigate = useNavigate();
    const handleClick = () => {
        navigate(`/${props.stub.typeName}/${props.stub.refId}`);
    };

    return (
        <div onClick={handleClick} class={`related-item indent-${props.indent}`}>
            {name}
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
        (props.liveModel.theory().modelTypes ?? []).map(modelCellConstructor);

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
    invariant(liveModel);
    const theory = liveModel().theory();

    if (judgment.tag === "object") {
        return theory.modelObTypeMeta(judgment.obType)?.name;
    }
    if (judgment.tag === "morphism") {
        return theory.modelMorTypeMeta(judgment.morType)?.name;
    }
}
