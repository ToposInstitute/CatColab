import Resizable, { type ContextValue } from "@corvu/resizable";
import { A, useNavigate, useParams } from "@solidjs/router";
import ChevronsRight from "lucide-solid/icons/chevrons-right";
import Maximize2 from "lucide-solid/icons/maximize-2";
import {
    Match,
    Show,
    Switch,
    createEffect,
    createResource,
    createSignal,
    useContext,
} from "solid-js";
import invariant from "tiny-invariant";

import { AnalysisNotebookEditor } from "../analysis/analysis_editor";
import { Api, useApi } from "../api";
import { IconButton, InlineInput, ResizableHandle } from "../components";
import { DiagramNotebookEditor } from "../diagram/diagram_editor";
import { ModelNotebookEditor } from "../model/model_editor";
import { DocumentBreadcrumbs, DocumentLoadingScreen, TheoryHelpButton } from "../page";
import { Layout } from "../page/layout";
import { TheoryLibrary, TheoryLibraryContext, stdTheories } from "../stdlib";
import { DocumentSidebar } from "./document_sidebar";
import {
    type AnyLiveDocument,
    type AnyLiveDocumentType,
    getDocumentTheory,
    getLiveDocument,
} from "./utils";

import "./document.css";
import { AnalysisWidget } from "../analysis/analysis_widget";
import { DiagramWidget } from "../diagram/diagram_widget";
import { ModelWidget } from "../model/model_widget";

export default function Document() {
    const api = useApi();
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Must provide theory library as context to model page");

    const params = useParams();
    const isSidePanelOpen = () => !!params.subkind && !!params.subref;

    const [liveDocument] = createResource(
        () => params.ref,
        (refId) => getLiveDocument(refId, api, theories, params.kind as AnyLiveDocumentType),
    );

    const [secondaryLiveModel] = createResource(
        () => {
            if (!params.subkind || !params.subref) {
                return;
            }

            return [params.subkind, params.subref] as const;
        },
        ([refKind, refId]) => getLiveDocument(refId, api, theories, refKind as AnyLiveDocumentType),
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
        <Show when={liveDocument()} fallback={<DocumentLoadingScreen />}>
            {(liveDocument) => (
                <Layout
                    toolbarContents={
                        <SplitPaneToolbar
                            document={liveDocument()}
                            panelSizes={resizableContext()?.sizes()}
                            maximizeSidePanel={maximizeSidePanel}
                            closeSidePanel={closeSidePanel}
                        />
                    }
                    sidebarContents={<DocumentSidebar liveDocument={liveDocument()} />}
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
                                        <DocumentPane document={liveDocument()} />
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
                                                            document={secondaryLiveModel()}
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
    document: AnyLiveDocument;
    panelSizes: number[] | undefined;
    closeSidePanel: () => void;
    maximizeSidePanel: () => void;
}) {
    const secondaryPanelSize = () => props.panelSizes?.[1];

    const documentTheory = () => getDocumentTheory(props.document);

    return (
        <>
            <DocumentBreadcrumbs document={props.document.liveDoc} />
            <span class="filler" />
            <Show when={documentTheory()}>
                {(documentTheory) => (
                    <TheoryHelpButton meta={stdTheories.getMetadata(documentTheory().id)} />
                )}
            </Show>
            {/*
        
            <PermissionsButton
                permissions={props.liveDocument.liveDoc.permissions}
                refId={props.liveDocument.refId}
            />
   */}
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

function DocumentPane(props: { document: AnyLiveDocument }) {
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories should be provided as context");

    return (
        <div class="notebook-container">
            <div class="document-head">
                <div class="title">
                    <InlineInput
                        text={props.document.liveDoc.doc.name}
                        setText={(text) => {
                            props.document.liveDoc.changeDoc((doc) => {
                                doc.name = text;
                            });
                        }}
                        placeholder="Untitled"
                    />
                </div>
                <div class="info">
                    <Switch>
                        <Match when={props.document.type === "model" && props.document}>
                            {(liveModel) => <ModelWidget liveModel={liveModel()} />}
                        </Match>
                        <Match when={props.document.type === "diagram" && props.document}>
                            {(liveDiagram) => <DiagramWidget liveDiagram={liveDiagram()} />}
                        </Match>
                        <Match when={props.document.type === "analysis" && props.document}>
                            {(liveAnalysis) => <AnalysisWidget liveAnalysis={liveAnalysis()} />}
                        </Match>
                    </Switch>
                </div>
            </div>
            <Switch>
                <Match when={props.document.type === "model" && props.document}>
                    {(liveModel) => <ModelNotebookEditor liveModel={liveModel()} />}
                </Match>
                <Match when={props.document.type === "diagram" && props.document}>
                    {(liveDiagram) => <DiagramNotebookEditor liveDiagram={liveDiagram()} />}
                </Match>
                <Match when={props.document.type === "analysis" && props.document}>
                    {(liveAnalysis) => <AnalysisNotebookEditor liveAnalysis={liveAnalysis()} />}
                </Match>
            </Switch>
        </div>
    );
}
