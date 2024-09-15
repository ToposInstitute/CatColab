import type { DocHandle } from "@automerge/automerge-repo";
import Resizable, { type ContextValue } from "@corvu/resizable";
import { MultiProvider } from "@solid-primitives/context";
import { useParams } from "@solidjs/router";
import {
    type Accessor,
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
import type { ModelJudgment } from "../model";
import { ModelValidationContext, TheoryContext } from "../model/model_context";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    newFormalCell,
} from "../notebook";
import { TheoryLibraryContext } from "../stdlib";
import type { ModelAnalysisMeta } from "../theory";
import { type LiveModelDocument, ModelPane, enlivenModelDocument } from "./model_document_editor";
import type { AnalysisDocument, ModelDocument } from "./types";

import Camera from "lucide-solid/icons/camera";
import PanelRight from "lucide-solid/icons/panel-right";
import PanelRightClose from "lucide-solid/icons/panel-right-close";

export type LiveAnalysisDocument = {
    refId: string;

    doc: AnalysisDocument;

    docHandle: DocHandle<AnalysisDocument>;

    liveModel: LiveModelDocument;
};

export default function AnalysisPage() {
    const params = useParams();

    const client = useContext(RPCContext);
    invariant(client, "Must provide a value for RPCContext to use AnalysisPage");

    const repo = useContext(RepoContext);
    invariant(repo, "Must provide a value for RepoContext to use AnalysisPage");

    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories should be provided as context");

    const [liveDoc] = createResource<LiveAnalysisDocument>(async () => {
        const { doc, docHandle } = await retrieveDoc<AnalysisDocument>(client, params.ref, repo);
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
            refId: params.ref,
            doc,
            docHandle,
            liveModel,
        };
    });

    return (
        <Switch>
            <Match when={liveDoc.loading}>
                <p>Loading...</p>
            </Match>
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
        <MultiProvider
            values={[
                [TheoryContext, props.liveDoc.liveModel.theory],
                [ModelContext, props.liveDoc.liveModel.formalJudgments],
                [ModelValidationContext, props.liveDoc.liveModel.validationResult],
            ]}
        >
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
        </MultiProvider>
    );
}

function ModelAnalysisCellEditor(props: FormalCellEditorProps<ModelAnalysis>) {
    const theory = useContext(TheoryContext);
    const model = useContext(ModelContext);

    const validationResult = useContext(ModelValidationContext);
    invariant(validationResult, "Result of model validation should be provided as context");

    const validatedModel = () => {
        const res = validationResult();
        if (res.tag === "validated") {
            return res.validatedModel;
        } else {
            return null;
        }
    };

    return (
        <Show when={theory?.()}>
            {(theory) => (
                <Show
                    when={theory().getModelAnalysis(props.content.id)}
                    fallback={<span>Internal error: model view not defined</span>}
                >
                    {(analysis) => (
                        <Dynamic
                            component={analysis().component}
                            model={model?.() ?? []}
                            validatedModel={validatedModel()}
                            theory={theory()}
                            content={props.content.content}
                            changeContent={(f: (c: unknown) => void) =>
                                props.changeContent((content) => f(content.content))
                            }
                        />
                    )}
                </Show>
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
const ModelContext = createContext<Accessor<Array<ModelJudgment>>>();

/** Editor for a model of a double theory.

The editor includes a notebook for the model itself plus another pane for
performing analysis of the model.
 */
export function AnalysisDocumentEditor(props: {
    liveDoc: LiveAnalysisDocument;
}) {
    const client = useContext(RPCContext);
    invariant(client, "Must provide RPCContext");

    const snapshotModel = () =>
        client.saveRef.mutate({
            refId: props.liveDoc.refId,
            note: "",
        });

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
                            <div class="toolbar">
                                <IconButton onClick={snapshotModel}>
                                    <Camera />
                                </IconButton>
                                <span class="filler" />
                                <IconButton onClick={toggleSidePanel}>
                                    <Show when={isSidePanelOpen()} fallback={<PanelRight />}>
                                        <PanelRightClose />
                                    </Show>
                                </IconButton>
                            </div>
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
                            </div>
                        </Resizable.Panel>
                    </>
                );
            }}
        </Resizable>
    );
}
