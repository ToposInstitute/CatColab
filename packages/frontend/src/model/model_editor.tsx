import { useNavigate, useParams } from "@solidjs/router";
import {
    For,
    Match,
    Show,
    Switch,
    createEffect,
    createResource,
    createSignal,
    useContext,
} from "solid-js";
import invariant from "tiny-invariant";

import type { ModelJudgment } from "catlog-wasm";
import { useApi } from "../api";
import { IconButton, InlineInput, ResizableHandle } from "../components";
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
    Toolbar,
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
import { RefStub, RelatedRefStub } from "catcolab-api";
import { DiagramPane } from "../diagram/diagram_editor";
import { AnalysisNotebookEditor } from "../analysis/analysis_editor";
import Resizable, { type ContextValue } from "@corvu/resizable";
// import PanelRight from "lucide-solid/icons/panel-right";
import Maximize2 from "lucide-solid/icons/maximize-2";
import ChevronsRight from "lucide-solid/icons/chevrons-right";

export default function ModelPage() {
    const api = useApi();
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Must provide theory library as context to model page");

    const params = useParams();
    const isSidePanelOpen = () => !!params.subkind && !!params.subref;

    const [liveModel] = createResource(
        () => params.ref,
        (refId) => getLiveDocument(refId, api, theories, params.kind as any),
    );

    const [secondaryLiveModel] = createResource(
        () => {
            if (!params.subkind || !params.subref) {
                return;
            }

            return [params.subkind, params.subref] as const;
        },
        ([refKind, refId]) => getLiveDocument(refId, api, theories, refKind as any),
    );

    const navigate = useNavigate();
    const closeSidePanel = () => {
        navigate(`/${params.kind}/${params.ref}`);
    };

    const maximizeSidePanel = () => {
        navigate(`/${params.subkind}/${params.subref}`);
    };

    const [resizableContext, setResizableContext] = createSignal<ContextValue>();
    createEffect(() => {
        const context = resizableContext();
        if (isSidePanelOpen()) {
            context?.expand(1);
            context?.resize(1, 0.33);
        } else {
            context?.collapse(1);
            context?.resize(0, 1);
        }
    });

    return (
        <Show when={liveModel()} fallback={<DocumentLoadingScreen />}>
            {(liveModel) => (
                <Layout
                    toolbarContents={
                        <SplitPaneToolbar
                            liveDocument={liveModel()}
                            panelSizes={resizableContext()?.sizes()}
                            maximizeSidePanel={maximizeSidePanel}
                            closeSidePanel={closeSidePanel}
                        />
                    }
                    sidebarContents={
                        <>
                            <DocumentMenu liveDocument={liveModel()} />
                            <RelatedDocuments refId={params.ref!} liveDocument={liveModel()} />
                        </>
                    }
                >
                    <Resizable class="growable-container">
                        {() => {
                            const context = Resizable.useContext();
                            setResizableContext(context);

                            return (
                                <>
                                    <Resizable.Panel
                                        class="content-panel"
                                        collapsible
                                        initialSize={1}
                                        minSize={0.25}
                                    >
                                        <DocumentPane liveDocument={liveModel()} />
                                    </Resizable.Panel>
                                    <ResizableHandle hidden={!isSidePanelOpen()} />
                                    <Show when={isSidePanelOpen()}>
                                        <Resizable.Panel
                                            collapsible
                                            minSize={0.25}
                                            onCollapse={closeSidePanel}
                                        >
                                            <Show when={secondaryLiveModel()}>
                                                {(secondaryLiveModel) => (
                                                    <>
                                                        <DocumentPane
                                                            liveDocument={secondaryLiveModel()}
                                                        />
                                                    </>
                                                )}
                                            </Show>
                                        </Resizable.Panel>
                                    </Show>
                                </>
                            );
                        }}
                    </Resizable>
                </Layout>
            )}
        </Show>
    );
}

function SplitPaneToolbar(props: {
    liveDocument: AnyLiveDocument;
    panelSizes: number[] | undefined;
    closeSidePanel: () => void;
    maximizeSidePanel: () => void;
}) {
    const secondaryPanelSize = () => props.panelSizes?.[1];

    return (
        <>
            <DocumentBreadcrumbs document={props.liveDocument} />
            <span class="filler" />
            <PermissionsButton
                permissions={props.liveDocument.liveDoc.permissions}
                refId={props.liveDocument.refId}
            />
            <Show when={secondaryPanelSize()}>
                {(panelSize) => (
                    <div
                        class="secondary-toolbar toolbar"
                        style={{ left: `${(1 - panelSize()) * 100}%` }}
                    >
                        <IconButton onClick={props.closeSidePanel} tooltip="Close">
                            <ChevronsRight />
                        </IconButton>
                        <IconButton onClick={props.maximizeSidePanel} tooltip="Open in full page">
                            <Maximize2 />
                        </IconButton>
                    </div>
                )}
            </Show>
        </>
    );
}

function DocumentPane(props: { liveDocument: AnyLiveDocument }) {
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
function RelatedDocuments(props: {
    refId: string;
    liveDocument: AnyLiveDocument;
}) {
    // console.log(props.liveDocument);
    const api = useApi();
    const [data] = createResource(
        () => props.refId,
        async (refId) => {
            const results = await api.rpc.get_related_ref_stubs.query(refId);

            if (results.tag != "Ok") {
                throw "couldn't load results";
            }

            return results.content;
        },
    );

    return (
        <Show when={data()} fallback={<div>Loading related items...</div>}>
            {(tree) => (
                <div class="related-tree">
                    <DocumentsTreeNode
                        node={tree()}
                        indent={1}
                        currentLiveDoc={props.liveDocument}
                    />
                </div>
            )}
        </Show>
    );
}

function DocumentsTreeNode(props: {
    node: RelatedRefStub;
    indent: number;
    currentLiveDoc: AnyLiveDocument;
}) {
    return (
        <>
            <DocumentsTreeLeaf
                stub={props.node.stub}
                indent={props.indent}
                currentLiveDoc={props.currentLiveDoc}
            />
            <For each={props.node.children}>
                {(child) => (
                    <DocumentsTreeNode
                        node={child}
                        indent={props.indent + 1}
                        currentLiveDoc={props.currentLiveDoc}
                    />
                )}
            </For>
        </>
    );
}

function DocumentsTreeLeaf(props: {
    stub: RefStub;
    indent: number;
    currentLiveDoc: AnyLiveDocument;
}) {
    const navigate = useNavigate();
    const handleClick = () => {
        navigate(
            `/${props.currentLiveDoc.type}/${props.currentLiveDoc.refId}/${props.stub.typeName}/${props.stub.refId}`,
        );
    };

    return (
        <div
            onClick={handleClick}
            class={`related-item ${props.stub.refId === props.currentLiveDoc.refId ? "current-item" : ""}`}
            style={{ "padding-left": `${props.indent * 16}px` }}
        >
            {(props.stub.refId === props.currentLiveDoc.refId
                ? props.currentLiveDoc.liveDoc.doc.name
                : props.stub.name) || "Untitled"}
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
