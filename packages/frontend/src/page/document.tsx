import { useNavigate, useParams, A } from "@solidjs/router";
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

import { useApi } from "../api";
import { IconButton, InlineInput, ResizableHandle } from "../components";
import {
    AppMenu,
    DocumentBreadcrumbs,
    DocumentLoadingScreen,
    DocumentMenu,
    getLiveDocument,
    TheoryHelpButton,
    type AnyLiveDocument,
} from "../page";

import { TheoryLibraryContext } from "../stdlib";
import { PermissionsButton } from "../user";
import { createModel } from "../model/document";

import { Layout } from "../page/layout";
import { RefStub, RelatedRefStub } from "catcolab-api";
import { DiagramNotebookEditor } from "../diagram/diagram_editor";
import { AnalysisNotebookEditor } from "../analysis/analysis_editor";
import Resizable, { type ContextValue } from "@corvu/resizable";
import Maximize2 from "lucide-solid/icons/maximize-2";
import ChevronsRight from "lucide-solid/icons/chevrons-right";
import FilePlus from "lucide-solid/icons/file-plus";

import "./document.css";
import { ModelNotebookEditor } from "../model/model_editor";
import { TheorySelectorDialog } from "../model/theory_selector";

export default function Document() {
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
                            <AppMenu />
                            <RelatedDocuments refId={params.ref!} liveDocument={liveModel()} />
                            <NewModelItem2 />
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
                                        initialSize={1}
                                        minSize={0.25}
                                    >
                                        <DocumentPane liveDocument={liveModel()} />
                                    </Resizable.Panel>
                                    <Show when={isSidePanelOpen()}>
                                        <ResizableHandle class="resizeable-handle" />
                                        <Resizable.Panel
                                            class="content-panel"
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

export function NewModelItem2() {
    const api = useApi();
    const navigate = useNavigate();

    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Theory library must be provided as context");

    const onNewModel = async () => {
        const newRef = await createModel(api, theories.getDefault().id);
        navigate(`/model/${newRef}`);
    };

    return (
        <div onClick={onNewModel}>
            <FilePlus />
            New Model
        </div>
    );
}

function SplitPaneToolbar(props: {
    liveDocument: AnyLiveDocument;
    panelSizes: number[] | undefined;
    closeSidePanel: () => void;
    maximizeSidePanel: () => void;
}) {
    const secondaryPanelSize = () => props.panelSizes?.[1];
    console.log(props.liveDocument);

    return (
        <>
            <DocumentBreadcrumbs document={props.liveDocument} />
            <span class="filler" />
            <Show when={(props.liveDocument as any).liveModel?.theory()}>
                <TheoryHelpButton theory={(props.liveDocument as any).liveModel.theory()} />
            </Show>
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
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories should be provided as context");

    return (
        <div class="notebook-container">
            <div class="document-head">
                <div class="title">
                    <InlineInput
                        text={props.liveDocument.liveDoc.doc.name}
                        setText={(text) => {
                            props.liveDocument.liveDoc.changeDoc((doc) => {
                                doc.name = text;
                            });
                        }}
                        placeholder="Untitled"
                    />
                </div>
                <div class="info">
                    <Switch>
                        <Match when={props.liveDocument.type === "model" && props.liveDocument}>
                            {(liveModel) => (
                                <TheorySelectorDialog
                                    theory={liveModel().theory()}
                                    setTheory={(id) => {
                                        liveModel().liveDoc.changeDoc((model) => {
                                            model.theory = id;
                                        });
                                    }}
                                    theories={theories}
                                    disabled={liveModel().liveDoc.doc.notebook.cells.some(
                                        (cell) => cell.tag === "formal",
                                    )}
                                />
                            )}
                        </Match>
                        <Match when={props.liveDocument.type === "diagram" && props.liveDocument}>
                            {(liveDiagram) => (
                                <>
                                    <div class="name">
                                        {liveDiagram().liveModel.theory().instanceOfName}
                                    </div>
                                    <div class="model">
                                        <A href={`/model/${liveDiagram().liveModel.refId}`}>
                                            {liveDiagram().liveModel.liveDoc.doc.name || "Untitled"}
                                        </A>
                                    </div>
                                </>
                            )}
                        </Match>
                        <Match when={props.liveDocument.type === "analysis" && props.liveDocument}>
                            {(liveAnalysis) => {
                                const parentRefId = () => {
                                    if (liveAnalysis().analysisType === "diagram") {
                                        return liveAnalysis().liveDiagram.refId;
                                    } else {
                                        return liveAnalysis().liveModel.refId;
                                    }
                                };

                                const parentRefName = () => {
                                    if (liveAnalysis().analysisType === "diagram") {
                                        return liveAnalysis().liveDiagram.liveDoc.doc.name;
                                    } else {
                                        return liveAnalysis().liveModel.liveDoc.doc.name;
                                    }
                                };

                                return (
                                    <>
                                        <div class="name">Analysis!</div>
                                        <div class="model">
                                            <A
                                                href={`/${liveAnalysis().analysisType}/${parentRefId()}`}
                                            >
                                                {parentRefName() || "Untitled"}
                                            </A>
                                        </div>
                                    </>
                                );
                            }}
                        </Match>
                    </Switch>
                </div>
            </div>
            <Switch>
                <Match when={props.liveDocument.type === "model" && props.liveDocument}>
                    {(liveModel) => <ModelNotebookEditor liveModel={liveModel()} />}
                </Match>
                <Match when={props.liveDocument.type === "diagram" && props.liveDocument}>
                    {(liveDiagram) => <DiagramNotebookEditor liveDiagram={liveDiagram()} />}
                </Match>
                <Match when={props.liveDocument.type === "analysis" && props.liveDocument}>
                    {(liveAnalysis) => <AnalysisNotebookEditor liveAnalysis={liveAnalysis()} />}
                </Match>
            </Switch>
        </div>
    );
}

function RelatedDocuments(props: {
    refId: string;
    liveDocument: AnyLiveDocument;
}) {
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
                        isDescendantOfActiveDocument={false}
                        parentRefId={null}
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
    parentRefId: string | null;
    isDescendantOfActiveDocument: boolean;
    currentLiveDoc: AnyLiveDocument;
}) {
    const isDescendant = () => {
        if (props.isDescendantOfActiveDocument) {
            return true;
        }

        if (props.node.stub.refId === props.currentLiveDoc.refId) {
            return true;
        }

        return false;
    };

    return (
        <>
            <DocumentsTreeLeaf
                stub={props.node.stub}
                indent={props.indent}
                currentLiveDoc={props.currentLiveDoc}
                parentRefId={props.parentRefId}
                isDescendantOfActiveDocument={props.isDescendantOfActiveDocument}
            />
            <For each={props.node.children}>
                {(child) => (
                    <DocumentsTreeNode
                        node={child}
                        indent={props.indent + 1}
                        parentRefId={props.node.stub.refId}
                        currentLiveDoc={props.currentLiveDoc}
                        isDescendantOfActiveDocument={isDescendant()}
                    />
                )}
            </For>
        </>
    );
}

function DocumentsTreeLeaf(props: {
    stub: RefStub;
    parentRefId: string | null;
    indent: number;
    currentLiveDoc: AnyLiveDocument;
    isDescendantOfActiveDocument: boolean;
}) {
    const navigate = useNavigate();

    const handleClick = () => {
        // if (props.stub.refId === props.currentLiveDoc.refId) {
        //     navigate(`/${props.stub.typeName}/${props.stub.refId}`);
        //     return;
        // }

        // if (props.isDescendantOfActiveDocument) {
        navigate(
            `/${props.currentLiveDoc.type}/${props.currentLiveDoc.refId}/${props.stub.typeName}/${props.stub.refId}`,
        );

        // return;
        // }

        // navigate(`/${props.stub.typeName}/${props.stub.refId}`);
    };

    return (
        <div
            onClick={handleClick}
            class="related-document"
            classList={{
                active: props.stub.refId === props.currentLiveDoc.refId,
                descendant: props.isDescendantOfActiveDocument,
            }}
            style={{ "padding-left": `${props.indent * 16}px` }}
        >
            <div class="document-name">
                {(props.stub.refId === props.currentLiveDoc.refId
                    ? props.currentLiveDoc.liveDoc.doc.name
                    : props.stub.name) || "Untitled"}
            </div>
            <div class="document-actions">
                <div>
                    <DocumentMenu stub={props.stub} parentRefId={props.parentRefId}></DocumentMenu>
                </div>
            </div>
        </div>
    );
}
