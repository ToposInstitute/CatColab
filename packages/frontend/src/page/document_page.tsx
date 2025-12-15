import Resizable, { type ContextValue } from "@corvu/resizable";
import { useNavigate, useParams } from "@solidjs/router";
import ChevronsRight from "lucide-solid/icons/chevrons-right";
import Maximize2 from "lucide-solid/icons/maximize-2";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import {
    createEffect,
    createResource,
    createSignal,
    Match,
    Show,
    Switch,
    useContext,
} from "solid-js";
import invariant from "tiny-invariant";

import {
    Button,
    IconButton,
    InlineInput,
    ResizableHandle,
    WarningBanner,
} from "catcolab-ui-components";
import { getLiveAnalysis, type LiveAnalysisDoc } from "../analysis";
import { AnalysisNotebookEditor } from "../analysis/analysis_editor";
import { AnalysisInfo } from "../analysis/analysis_info";
import { type Api, type DocRef, type DocumentType, useApi } from "../api";
import { getLiveDiagram, type LiveDiagramDoc } from "../diagram";
import { DiagramNotebookEditor } from "../diagram/diagram_editor";
import { DiagramInfo } from "../diagram/diagram_info";
import { type LiveModelDoc, type ModelLibrary, ModelLibraryContext } from "../model";
import { ModelNotebookEditor } from "../model/model_editor";
import { ModelInfo } from "../model/model_info";
import { DocumentBreadcrumbs, DocumentLoadingScreen } from "../page";
import { SidebarLayout } from "../page/sidebar_layout";
import { PermissionsButton } from "../user";
import { assertExhaustive } from "../util/assert_exhaustive";
import { DocumentSidebar } from "./document_page_sidebar";

import "./document_page.css";

type AnyLiveDoc = LiveModelDoc | LiveDiagramDoc | LiveAnalysisDoc;

/** A Live*Document bundled with its backend DocRef.
 *
 * This type is used in UI contexts where we need both the live document
 * and its backend metadata.
 */
type AnyLiveDocWithRef = {
    liveDoc: AnyLiveDoc;
    docRef: DocRef;
};

// The initial size of the right panel in a split as a percentage of the total available width
const INITIAL_SPLIT_SIZE = 0.33;

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

    const [primaryLiveDoc, { refetch: refetchPrimaryDoc }] = createResource(
        () => params.ref,
        (refId) => getLiveDocument(refId, api, models, params.kind as DocumentType),
    );

    const [secondaryLiveDoc, { refetch: refetchSecondaryDoc }] = createResource(
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
            // expand the second panel
            context?.expand(1);
        } else {
            // collapse the second panel
            context?.collapse(1);
            // Set the first panel to be the full size
            context?.resize(0, 1);
        }
    });

    return (
        <Show when={primaryLiveDoc()} fallback={<DocumentLoadingScreen />}>
            {(docWithRef) => (
                <SidebarLayout
                    toolbarContents={
                        <SplitPaneToolbar
                            doc={docWithRef().liveDoc}
                            docRef={docWithRef().docRef}
                            panelSizes={resizableContext()?.sizes()}
                            maximizeSidePanel={maximizeSidePanel}
                            closeSidePanel={closeSidePanel}
                        />
                    }
                    sidebarContents={
                        <DocumentSidebar
                            primaryDoc={{
                                liveDoc: docWithRef().liveDoc.liveDoc,
                                docRef: docWithRef().docRef,
                            }}
                            secondaryDoc={(() => {
                                const secondary = secondaryLiveDoc();
                                return secondary
                                    ? {
                                          liveDoc: secondary.liveDoc.liveDoc,
                                          docRef: secondary.docRef,
                                      }
                                    : undefined;
                            })()}
                            refetchPrimaryDoc={refetchPrimaryDoc}
                            refetchSecondaryDoc={refetchSecondaryDoc}
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
                                            doc={docWithRef().liveDoc}
                                            docRef={docWithRef().docRef}
                                            refetchPrimaryDoc={refetchPrimaryDoc}
                                            refetchSecondaryDoc={refetchSecondaryDoc}
                                        />
                                    </Resizable.Panel>
                                    <Show when={isSidePanelOpen()}>
                                        <ResizableHandle class="resizeable-handle" />
                                        <Resizable.Panel
                                            class="content-panel"
                                            initialSize={INITIAL_SPLIT_SIZE}
                                            minSize={0.25}
                                            onCollapse={closeSidePanel}
                                        >
                                            <Show when={secondaryLiveDoc()}>
                                                {(secondaryLiveDocWithRef) => (
                                                    <>
                                                        <DocumentPane
                                                            doc={secondaryLiveDocWithRef().liveDoc}
                                                            docRef={
                                                                secondaryLiveDocWithRef().docRef
                                                            }
                                                            refetchPrimaryDoc={refetchPrimaryDoc}
                                                            refetchSecondaryDoc={
                                                                refetchSecondaryDoc
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
    doc: AnyLiveDoc;
    docRef: DocRef;
    panelSizes: number[] | undefined;
    closeSidePanel: () => void;
    maximizeSidePanel: () => void;
}) {
    const secondaryPanelSize = () => props.panelSizes?.[1];

    return (
        <>
            <DocumentBreadcrumbs liveDoc={props.doc.liveDoc} docRefId={props.docRef.refId} />
            <span class="filler" />
            <PermissionsButton liveDoc={props.doc.liveDoc} docRef={props.docRef} />
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
    doc: AnyLiveDoc;
    docRef: DocRef;
    refetchPrimaryDoc: () => void;
    refetchSecondaryDoc: () => void;
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
                props.refetchPrimaryDoc();
                props.refetchSecondaryDoc();
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
                <WarningBanner
                    actions={
                        <Button
                            variant="utility"
                            onClick={(e) => {
                                e.preventDefault();
                                handleRestore();
                            }}
                        >
                            <RotateCcw size={16} /> Restore it
                        </Button>
                    }
                >
                    This {props.doc.type} has been deleted and will not be listed in your documents.
                </WarningBanner>
            </Show>
            <div class="notebook-container">
                <div class="document-head">
                    <div class="title">
                        <InlineInput
                            text={props.doc.liveDoc.doc.name}
                            setText={(text) => {
                                props.doc.liveDoc.changeDoc((doc) => {
                                    doc.name = text;
                                });
                            }}
                            placeholder="Untitled"
                        />
                    </div>
                    <div class="info">
                        <Switch>
                            <Match when={props.doc.type === "model" && props.doc}>
                                {(liveModel) => <ModelInfo liveModel={liveModel()} />}
                            </Match>
                            <Match when={props.doc.type === "diagram" && props.doc}>
                                {(liveDiagram) => <DiagramInfo liveDiagram={liveDiagram()} />}
                            </Match>
                            <Match when={props.doc.type === "analysis" && props.doc}>
                                {(liveAnalysis) => <AnalysisInfo liveAnalysis={liveAnalysis()} />}
                            </Match>
                        </Switch>
                    </div>
                </div>
                <Switch>
                    <Match when={props.doc.type === "model" && props.doc}>
                        {(liveModel) => <ModelNotebookEditor liveModel={liveModel()} />}
                    </Match>
                    <Match when={props.doc.type === "diagram" && props.doc}>
                        {(liveDiagram) => <DiagramNotebookEditor liveDiagram={liveDiagram()} />}
                    </Match>
                    <Match when={props.doc.type === "analysis" && props.doc}>
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
            const docRef = await api.getDocRef(refId);
            const liveDoc = await models.getLiveModel(refId);
            return { liveDoc, docRef };
        }
        case "diagram": {
            const { liveDiagram, docRef } = await getLiveDiagram(refId, api, models);
            return { liveDoc: liveDiagram, docRef };
        }
        case "analysis": {
            const { liveAnalysis, docRef } = await getLiveAnalysis(refId, api, models);
            return { liveDoc: liveAnalysis, docRef };
        }
        default:
            assertExhaustive(documentType);
    }
}
