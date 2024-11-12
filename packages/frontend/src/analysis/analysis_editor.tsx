import Resizable, { type ContextValue } from "@corvu/resizable";
import { useParams } from "@solidjs/router";
import { Show, createEffect, createResource, createSignal, useContext } from "solid-js";
import { Dynamic } from "solid-js/web";
import invariant from "tiny-invariant";

import { RepoContext, RpcContext, getLiveDoc } from "../api";
import { IconButton, ResizableHandle } from "../components";
import { LiveModelContext, type ModelDocument, enlivenModelDocument } from "../model";
import { ModelPane } from "../model/model_editor";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    newFormalCell,
} from "../notebook";
import { BrandedToolbar, HelpButton } from "../page";
import { TheoryLibraryContext } from "../stdlib";
import type { ModelAnalysisMeta } from "../theory";
import type { AnalysisDocument, LiveAnalysisDocument } from "./document";
import type { ModelAnalysis } from "./types";

import PanelRight from "lucide-solid/icons/panel-right";
import PanelRightClose from "lucide-solid/icons/panel-right-close";

export default function AnalysisPage() {
    const params = useParams();
    const refId = params.ref;
    invariant(refId, "Must provide document ref as parameter to analysis page");

    const rpc = useContext(RpcContext);
    const repo = useContext(RepoContext);
    const theories = useContext(TheoryLibraryContext);
    invariant(rpc && repo && theories, "Missing context for analysis page");

    const [liveAnalysis] = createResource<LiveAnalysisDocument>(async () => {
        const liveDoc = await getLiveDoc<AnalysisDocument>(rpc, repo, refId);
        const { doc } = liveDoc;
        invariant(doc.type === "analysis", () => `Expected analysis, got type: ${doc.type}`);

        const liveModelDoc = await getLiveDoc<ModelDocument>(rpc, repo, doc.modelRef.refId);
        const liveModel = enlivenModelDocument(doc.modelRef.refId, liveModelDoc, theories);

        return { refId, liveDoc, liveModel };
    });

    return (
        <Show when={liveAnalysis()}>
            {(liveAnalysis) => <AnalysisDocumentEditor liveAnalysis={liveAnalysis()} />}
        </Show>
    );
}

/** Notebook editor for analyses of models of double theories.
 */
export function AnalysisPane(props: {
    liveAnalysis: LiveAnalysisDocument;
}) {
    const liveDoc = () => props.liveAnalysis.liveDoc;
    return (
        <LiveModelContext.Provider value={props.liveAnalysis.liveModel}>
            <NotebookEditor
                handle={liveDoc().docHandle}
                path={["notebook"]}
                notebook={liveDoc().doc.notebook}
                changeNotebook={(f) => liveDoc().changeDoc((doc) => f(doc.notebook))}
                formalCellEditor={ModelAnalysisCellEditor}
                cellConstructors={modelAnalysisCellConstructors(
                    props.liveAnalysis.liveModel.theory()?.modelAnalyses ?? [],
                )}
                noShortcuts={true}
            />
        </LiveModelContext.Provider>
    );
}

function ModelAnalysisCellEditor(props: FormalCellEditorProps<ModelAnalysis>) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context for analysis");

    return (
        <Show when={liveModel.theory()?.modelAnalysis(props.content.id)}>
            {(analysis) => (
                <Dynamic
                    component={analysis().component}
                    liveModel={liveModel}
                    content={props.content.content}
                    changeContent={(f: (c: unknown) => void) =>
                        props.changeContent((content) => f(content.content))
                    }
                />
            )}
        </Show>
    );
}

function modelAnalysisCellConstructors(
    analyses: ModelAnalysisMeta[],
): CellConstructor<ModelAnalysis>[] {
    return analyses.map((analysis) => {
        const { id, name, description, initialContent } = analysis;
        return {
            name,
            description,
            construct: () =>
                newFormalCell({
                    id,
                    content: initialContent(),
                }),
        };
    });
}

/** Editor for a model of a double theory.

The editor includes a notebook for the model itself plus another pane for
performing analysis of the model.
 */
export function AnalysisDocumentEditor(props: {
    liveAnalysis: LiveAnalysisDocument;
}) {
    const rpc = useContext(RpcContext);
    invariant(rpc, "Must provide RPC context");

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
                            <BrandedToolbar>
                                <HelpButton />
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
                            </BrandedToolbar>
                            <ModelPane liveModel={props.liveAnalysis.liveModel} />
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
                                <h2>Analysis</h2>
                                <AnalysisPane liveAnalysis={props.liveAnalysis} />
                            </div>
                        </Resizable.Panel>
                    </>
                );
            }}
        </Resizable>
    );
}
