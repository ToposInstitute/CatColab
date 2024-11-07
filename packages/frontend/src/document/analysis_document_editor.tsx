import type { DocHandle } from "@automerge/automerge-repo";
import Resizable, { type ContextValue } from "@corvu/resizable";
import { useParams } from "@solidjs/router";
import {
    Match,
    Show,
    Switch,
    createContext,
    createEffect,
    createResource,
    createSignal,
    useContext,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import invariant from "tiny-invariant";

import type { ModelAnalysis } from "../analysis";
import { RPCContext, RepoContext, retrieveDoc } from "../api";
import { IconButton, ResizableHandle } from "../components";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    newFormalCell,
} from "../notebook";
import { BrandedToolbar, HelpButton } from "../page";
import { TheoryLibraryContext } from "../stdlib";
import type { ModelAnalysisMeta } from "../theory";
import { type LiveModelDocument, ModelPane, enlivenModelDocument } from "./model_document_editor";
import type { AnalysisDocument, ModelDocument } from "./types";

import PanelRight from "lucide-solid/icons/panel-right";
import PanelRightClose from "lucide-solid/icons/panel-right-close";
import { handleExportSVG } from "../visualization";

/** An analysis document "live" for editing.
 */
export type LiveAnalysisDocument = {
    /** The ref for which this is a live document. */
    refId: string;

    /** The analysis document, suitable for use in reactive contexts. */
    doc: AnalysisDocument;

    /** The document handle for the analysis document. */
    docHandle: DocHandle<AnalysisDocument>;

    /** Live model that the analysis is of. */
    liveModel: LiveModelDocument;
};

export default function AnalysisPage() {
    const params = useParams();
    const ref = params.ref;
    invariant(ref, "Must provide analysis ref as parameter to analysis page");

    const client = useContext(RPCContext);
    const repo = useContext(RepoContext);
    const theories = useContext(TheoryLibraryContext);
    invariant(client && repo && theories, "Missing context for analysis page");

    const [liveDoc] = createResource<LiveAnalysisDocument>(async () => {
        const { doc, docHandle } = await retrieveDoc<AnalysisDocument>(client, ref, repo);
        await docHandle.whenReady();
        invariant(
            doc.type === "analysis",
            () => `Expected analysis document, got type: ${doc.type}`,
        );

        const { doc: modelDoc, docHandle: modelDocHandle } = await retrieveDoc<ModelDocument>(
            client,
            doc.modelRef.__extern__.refId,
            repo,
        );
        const liveModel = enlivenModelDocument(
            doc.modelRef.__extern__.refId,
            modelDoc,
            modelDocHandle,
            theories,
        );

        return {
            refId: ref,
            doc,
            docHandle,
            liveModel,
        };
    });

    return (
        <Switch>
            <Match when={liveDoc.error}>
                <span>Error: {liveDoc.error}</span>
            </Match>
            <Match when={liveDoc()}>
                {(liveDoc) => <AnalysisDocumentEditor liveDoc={liveDoc()} />}
            </Match>
        </Switch>
    );
}

/** Notebook editor for analyses of models of double theories.
 */
export function AnalysisPane(props: {
    liveDoc: LiveAnalysisDocument;
}) {
    return (
        <LiveModelContext.Provider value={props.liveDoc.liveModel}>
            <NotebookEditor
                handle={props.liveDoc.docHandle}
                path={["notebook"]}
                notebook={props.liveDoc.doc.notebook}
                changeNotebook={(f) => props.liveDoc.docHandle.change((doc) => f(doc.notebook))}
                formalCellEditor={ModelAnalysisCellEditor}
                cellConstructors={modelAnalysisCellConstructors(
                    props.liveDoc.liveModel.theory()?.modelAnalyses ?? [],
                )}
                noShortcuts={true}
            />
        </LiveModelContext.Provider>
    );
}

function ModelAnalysisCellEditor(props: FormalCellEditorProps<ModelAnalysis>) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Model should be provided as context for analysis");

    return (
        <Show when={liveModel.theory()?.getModelAnalysis(props.content.id)}>
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

/** Context for the model being analyzed. */
const LiveModelContext = createContext<LiveModelDocument>();

/** Editor for a model of a double theory.

The editor includes a notebook for the model itself plus another pane for
performing analysis of the model.
 */
export function AnalysisDocumentEditor(props: {
    liveDoc: LiveAnalysisDocument;
}) {
    const client = useContext(RPCContext);
    invariant(client, "Must provide RPCContext");

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
                            <ModelPane liveDoc={props.liveDoc.liveModel} />
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
                                <AnalysisPane liveDoc={props.liveDoc} />
                                <div>
                                <button class="export-button" onClick={handleExportSVG}>Export SVG</button>
                                </div>
                            </div>
                        </Resizable.Panel>
                    </>
                );
            }}
        </Resizable>
    );
}
