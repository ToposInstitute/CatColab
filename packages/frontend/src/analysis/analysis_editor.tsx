import Resizable, { type ContextValue } from "@corvu/resizable";
import { useParams } from "@solidjs/router";
import {
    Match,
    Show,
    Switch,
    createEffect,
    createResource,
    createSignal,
    useContext,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import invariant from "tiny-invariant";

import { useApi } from "../api";
import { IconButton, ResizableHandle } from "../components";
import { DiagramPane } from "../diagram/diagram_editor";
import { ModelPane } from "../model/model_editor";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    newFormalCell,
} from "../notebook";
import {
    DocumentBreadcrumbs,
    DocumentLoadingScreen,
    DocumentMenu,
    Toolbar,
} from "../page";
import { TheoryLibraryContext } from "../stdlib";
import type { AnalysisMeta } from "../theory";
import { assertExhaustive } from "../util/assert_exhaustive";
import { LiveAnalysisContext } from "./context";
import {
    type LiveAnalysisDocument,
    type LiveDiagramAnalysisDocument,
    type LiveModelAnalysisDocument,
    getLiveAnalysis,
} from "./document";
import type { Analysis } from "./types";

import PanelRight from "lucide-solid/icons/panel-right";
import PanelRightClose from "lucide-solid/icons/panel-right-close";

export default function AnalysisPage() {
    const api = useApi();
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Must provide theory library as context to analysis page");

    const params = useParams();

    const [liveAnalysis] = createResource(
        () => params.ref,
        (refId) => getLiveAnalysis(refId, api, theories),
    );

    return (
        <Show when={liveAnalysis()} fallback={<DocumentLoadingScreen />}>
            {(loadedAnalysis) => <AnalysisDocumentEditor liveAnalysis={loadedAnalysis()} />}
        </Show>
    );
}

/** Editor for a model of a double theory.

The editor includes a notebook for the model itself plus another pane for
performing analysis of the model.
 */
export function AnalysisDocumentEditor(props: {
    liveAnalysis: LiveAnalysisDocument;
}) {
    const [resizableContext, setResizableContext] = createSignal<ContextValue>();
    const [isSidePanelOpen, setSidePanelOpen] = createSignal(true);

    createEffect(() => {
        const context = resizableContext();
        if (isSidePanelOpen()) {
            context?.expand(1);
        } else {
            context?.collapse(1);
        }
    });

    const toggleSidePanel = () => {
        const open = setSidePanelOpen(!isSidePanelOpen());
        if (open) {
            resizableContext()?.resize(1, 0.33);
        }
    };

    return (
        <Resizable class="growable-container">
            {() => {
                const context = Resizable.useContext();
                setResizableContext(context);

                return (
                    <>
                        <Resizable.Panel
                            class="content-panel"
                            collapsible
                            initialSize={0.66}
                            minSize={0.25}
                        >
                            <Toolbar>
                                <AnalysisMenu liveAnalysis={props.liveAnalysis} />
                                <DocumentBreadcrumbs document={props.liveAnalysis} />
                                <span class="filler" />
                                <IconButton
                                    onClick={toggleSidePanel}
                                    tooltip={
                                        isSidePanelOpen()
                                            ? "Hide the analysis panel"
                                            : "Show the analysis panel"
                                    }
                                >
                                    <Show when={isSidePanelOpen()} fallback={<PanelRight />}>
                                        <PanelRightClose />
                                    </Show>
                                </IconButton>
                            </Toolbar>
                            <AnalysisOfPane liveAnalysis={props.liveAnalysis} />
                        </Resizable.Panel>
                        <ResizableHandle hidden={!isSidePanelOpen()} />
                        <Resizable.Panel
                            class="content-panel side-panel"
                            collapsible
                            initialSize={0.33}
                            minSize={0.25}
                            hidden={!isSidePanelOpen()}
                            onCollapse={() => setSidePanelOpen(false)}
                            onExpand={() => setSidePanelOpen(true)}
                        >
                            <div class="notebook-container">
                                <div class="toolbar">
                                    <div class="toolbar-spacer" />
                                </div>
                                <h2>Analysis</h2>
                                <AnalysisNotebookEditor liveAnalysis={props.liveAnalysis} />
                            </div>
                        </Resizable.Panel>
                    </>
                );
            }}
        </Resizable>
    );
}

const AnalysisMenu = (props: {
    liveAnalysis: LiveAnalysisDocument;
}) => {
    const liveDocument = () => {
        switch (props.liveAnalysis.analysisType) {
            case "diagram":
                return props.liveAnalysis.liveDiagram;
            case "model":
                return props.liveAnalysis.liveModel;
            default:
                assertExhaustive(props.liveAnalysis);
        }
    };

    return <DocumentMenu liveDocument={liveDocument()} />;
};

const AnalysisOfPane = (props: {
    liveAnalysis: LiveAnalysisDocument;
}) => (
    <Switch>
        <Match when={props.liveAnalysis.analysisType === "model" && props.liveAnalysis.liveModel}>
            {(liveModel) => <ModelPane liveModel={liveModel()} />}
        </Match>
        <Match
            when={props.liveAnalysis.analysisType === "diagram" && props.liveAnalysis.liveDiagram}
        >
            {(liveDiagram) => <DiagramPane liveDiagram={liveDiagram()} />}
        </Match>
    </Switch>
);

/** Notebook editor for analyses of models of double theories.
 */
export function AnalysisNotebookEditor(props: {
    liveAnalysis: LiveAnalysisDocument;
}) {
    const liveDoc = () => props.liveAnalysis.liveDoc;

    const cellConstructors = () => {
        let meta = undefined;
        if (props.liveAnalysis.analysisType === "model") {
            meta = theoryForAnalysis(props.liveAnalysis)?.modelAnalyses;
        } else if (props.liveAnalysis.analysisType === "diagram") {
            meta = theoryForAnalysis(props.liveAnalysis)?.diagramAnalyses;
        }
        return (meta ?? []).map(analysisCellConstructor);
    };

    return (
        <LiveAnalysisContext.Provider value={() => props.liveAnalysis}>
            <NotebookEditor
                handle={liveDoc().docHandle}
                path={["notebook"]}
                notebook={liveDoc().doc.notebook}
                changeNotebook={(f) => liveDoc().changeDoc((doc) => f(doc.notebook))}
                formalCellEditor={AnalysisCellEditor}
                cellConstructors={cellConstructors()}
                noShortcuts={true}
            />
        </LiveAnalysisContext.Provider>
    );
}

function AnalysisCellEditor(props: FormalCellEditorProps<Analysis<unknown>>) {
    const liveAnalysis = useContext(LiveAnalysisContext);
    invariant(liveAnalysis, "Live analysis should be provided as context for cell editor");

    return (
        <Switch>
            <Match
                when={
                    liveAnalysis().analysisType === "model" &&
                    theoryForAnalysis(liveAnalysis())?.modelAnalysis(props.content.id)
                }
            >
                {(analysis) => (
                    <Dynamic
                        component={analysis().component}
                        liveModel={(liveAnalysis() as LiveModelAnalysisDocument).liveModel}
                        content={props.content.content}
                        changeContent={(f: (c: unknown) => void) =>
                            props.changeContent((content) => f(content.content))
                        }
                    />
                )}
            </Match>
            <Match
                when={
                    liveAnalysis().analysisType === "diagram" &&
                    theoryForAnalysis(liveAnalysis())?.diagramAnalysis(props.content.id)
                }
            >
                {(analysis) => (
                    <Dynamic
                        component={analysis().component}
                        liveDiagram={(liveAnalysis() as LiveDiagramAnalysisDocument).liveDiagram}
                        content={props.content.content}
                        changeContent={(f: (c: unknown) => void) =>
                            props.changeContent((content) => f(content.content))
                        }
                    />
                )}
            </Match>
        </Switch>
    );
}

function analysisCellConstructor<T>(meta: AnalysisMeta<T>): CellConstructor<Analysis<T>> {
    const { id, name, description, initialContent } = meta;
    return {
        name,
        description,
        construct: () =>
            newFormalCell({
                id,
                content: initialContent(),
            }),
    };
}

function theoryForAnalysis(liveAnalysis: LiveAnalysisDocument) {
    switch (liveAnalysis.analysisType) {
        case "model":
            return liveAnalysis.liveModel.theory();
        case "diagram":
            return liveAnalysis.liveDiagram.liveModel.theory();
        default:
            assertExhaustive(liveAnalysis);
    }
}
