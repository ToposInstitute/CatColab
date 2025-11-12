import Resizable, { type ContextValue } from "@corvu/resizable";
import { useNavigate, useParams } from "@solidjs/router";
import ChevronsRight from "lucide-solid/icons/chevrons-right";
import Maximize2 from "lucide-solid/icons/maximize-2";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
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

import { Button, IconButton } from "catcolab-ui-components";
import { InlineInput, ResizableHandle } from "catcolab-ui-components";
import { type LiveAnalysisDocument, getLiveAnalysis } from "../analysis";
import { AnalysisNotebookEditor } from "../analysis/analysis_editor";
import { AnalysisInfo } from "../analysis/analysis_info";
import { type Api, type DocRef, type DocumentType, useApi } from "../api";
import { type LiveDiagramDocument, getLiveDiagram } from "../diagram";
import { DiagramNotebookEditor } from "../diagram/diagram_editor";
import { DiagramInfo } from "../diagram/diagram_info";
import { type LiveModelDocument, type ModelLibrary, ModelLibraryContext } from "../model";
import { ModelNotebookEditor } from "../model/model_editor";
import { ModelInfo } from "../model/model_info";
import { DocumentBreadcrumbs, DocumentLoadingScreen } from "../page";
import { SidebarLayout } from "../page/sidebar_layout";
import { PermissionsButton } from "../user";
import { assertExhaustive } from "../util/assert_exhaustive";
import { DocumentSidebar } from "./document_page_sidebar";

import "./document_page.css";

type AnyLiveDocument = LiveModelDocument | LiveDiagramDocument | LiveAnalysisDocument;

/** A Live*Document bundled with its backend DocRef.
 *
 * This type is used in UI contexts where we need both the live document
 * and its backend metadata.
 */
type AnyLiveDocWithRef = {
    liveDocument: AnyLiveDocument;
    docRef: DocRef;
};

export default function DocumentPage() {
    const api = useApi();
    const models = useContext(ModelLibraryContext);
    invariant(models, "Must provide model library as context to page");

    const params = useParams();
    const navigate = useNavigate();
    const isSidePanelOpen = () => !!params.subkind && !!params.subref;

    // Redirect if primary and secondary refs match
    createEffect(() => {
        if (params.subref && params.ref === params.subref) {
            navigate(`/${params.kind}/${params.ref}`, { replace: true });
        }
    });

    const [primaryLiveDocument, { refetch: refetchPrimaryDocument }] = createResource(
        () => params.ref,
        (refId) => getLiveDocument(refId, api, models, params.kind as DocumentType),
    );

    const [secondaryLiveDocument, { refetch: refetchSecondaryDocument }] = createResource(
        () => {
            if (!params.subkind || !params.subref) {
                return;
            }

            // Prevent the fetcher from running right before the redirect runs for matching primary and secondary refs
            if (params.subref === params.ref) {
                return;
            }

            return [params.subkind, params.subref] as const;
        },
        ([refKind, refId]) => getLiveDocument(refId, api, models, refKind as DocumentType),
    );
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
        <Show when={primaryLiveDocument()} fallback={<DocumentLoadingScreen />}>
            {(docWithRef) => (
                <SidebarLayout
                    toolbarContents={
                        <SplitPaneToolbar
                            document={docWithRef().liveDocument}
                            docRef={docWithRef().docRef}
                            panelSizes={resizableContext()?.sizes()}
                            maximizeSidePanel={maximizeSidePanel}
                            closeSidePanel={closeSidePanel}
                        />
                    }
                    sidebarContents={
                        <DocumentSidebar
                            primaryDoc={{
                                liveDoc: docWithRef().liveDocument.liveDoc,
                                docRef: docWithRef().docRef,
                            }}
                            secondaryDoc={(() => {
                                const secondary = secondaryLiveDocument();
                                return secondary
                                    ? {
                                          liveDoc: secondary.liveDocument.liveDoc,
                                          docRef: secondary.docRef,
                                      }
                                    : undefined;
                            })()}
                            refetchPrimaryDocument={refetchPrimaryDocument}
                            refetchSecondaryDocument={refetchSecondaryDocument}
                        />
                    }
                >
                    <Resizable class="resizeable-panels">
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
                                        <DocumentPane
                                            document={docWithRef().liveDocument}
                                            docRef={docWithRef().docRef}
                                            refetchPrimaryDocument={refetchPrimaryDocument}
                                            refetchSecondaryDocument={refetchSecondaryDocument}
                                        />
                                    </Resizable.Panel>
                                    <Show when={isSidePanelOpen()}>
                                        <ResizableHandle class="resizeable-handle" />
                                        <Resizable.Panel
                                            class="content-panel"
                                            minSize={0.25}
                                            onCollapse={closeSidePanel}
                                        >
                                            <Show when={secondaryLiveDocument()}>
                                                {(secondaryLiveDocWithRef) => (
                                                    <>
                                                        <DocumentPane
                                                            document={
                                                                secondaryLiveDocWithRef()
                                                                    .liveDocument
                                                            }
                                                            docRef={
                                                                secondaryLiveDocWithRef().docRef
                                                            }
                                                            refetchPrimaryDocument={
                                                                refetchPrimaryDocument
                                                            }
                                                            refetchSecondaryDocument={
                                                                refetchSecondaryDocument
                                                            }
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
                </SidebarLayout>
            )}
        </Show>
    );
}

function SplitPaneToolbar(props: {
    document: AnyLiveDocument;
    docRef: DocRef;
    panelSizes: number[] | undefined;
    closeSidePanel: () => void;
    maximizeSidePanel: () => void;
}) {
    const secondaryPanelSize = () => props.panelSizes?.[1];

    return (
        <>
            <DocumentBreadcrumbs liveDoc={props.document.liveDoc} docRefId={props.docRef.refId} />
            <span class="filler" />
            <PermissionsButton liveDoc={props.document.liveDoc} docRef={props.docRef} />
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

export function DocumentPane(props: {
    document: AnyLiveDocument;
    docRef: DocRef;
    refetchPrimaryDocument: () => void;
    refetchSecondaryDocument: () => void;
}) {
    const api = useApi();
    const [isDeleted, setIsDeleted] = createSignal(false);

    createEffect(() => {
        setIsDeleted(props.docRef.isDeleted);
    });

    const handleRestore = async () => {
        const refId = props.docRef.refId;

        if (!refId) {
            return;
        }

        // optimistic restore
        setIsDeleted(false);

        try {
            const result = await api.rpc.restore_ref.mutate(refId);
            if (result.tag === "Ok") {
                api.clearCachedDoc(refId);
                props.refetchPrimaryDocument();
                props.refetchSecondaryDocument();
            } else {
                console.error(`Failed to restore document: ${result.message}`);
            }
        } catch (error) {
            console.error(`Error restoring document: ${error}`);
        }
    };

    return (
        <>
            <Show when={isDeleted()}>
                <div class="warning-banner">
                    <TriangleAlert size={20} />
                    <div class="warning-banner-content">
                        <strong>Warning:</strong> This {props.document.type} has been deleted and
                        will not be listed in your documents.
                    </div>
                    <Button
                        variant="utility"
                        onClick={(e) => {
                            e.preventDefault();
                            handleRestore();
                        }}
                    >
                        <RotateCcw size={16} /> Restore it
                    </Button>
                </div>
            </Show>
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
                                {(liveModel) => <ModelInfo liveModel={liveModel()} />}
                            </Match>
                            <Match when={props.document.type === "diagram" && props.document}>
                                {(liveDiagram) => <DiagramInfo liveDiagram={liveDiagram()} />}
                            </Match>
                            <Match when={props.document.type === "analysis" && props.document}>
                                {(liveAnalysis) => <AnalysisInfo liveAnalysis={liveAnalysis()} />}
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
        </>
    );
}

async function getLiveDocument(
    refId: string,
    api: Api,
    models: ModelLibrary<string>,
    documentType: DocumentType,
): Promise<AnyLiveDocWithRef> {
    switch (documentType) {
        case "model": {
            const { liveDoc: _, docRef } = await api.getLiveDoc(refId, "model");
            const liveDocument = await models.getLiveModel(refId);
            return { liveDocument, docRef };
        }
        case "diagram": {
            const { liveDiagram, docRef } = await getLiveDiagram(refId, api, models);
            return { liveDocument: liveDiagram, docRef };
        }
        case "analysis": {
            const { liveAnalysis, docRef } = await getLiveAnalysis(refId, api, models);
            return { liveDocument: liveAnalysis, docRef };
        }
        default:
            assertExhaustive(documentType);
    }
}
