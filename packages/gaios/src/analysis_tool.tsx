import type { AutomergeUrl, DocHandle, Repo } from "@automerge/automerge-repo";
import { type Accessor, createEffect, createResource, Match, onCleanup, Switch } from "solid-js";
import { render } from "solid-js/web";

import {
    getLiveAnalysisFromRepo,
    type LiveAnalysisDoc,
    type LiveModelAnalysisDoc,
} from "../../frontend/src/analysis";
import { AnalysisNotebookEditor } from "../../frontend/src/analysis/analysis_editor";
import {
    createModelLibraryWithRepo,
    type ModelLibrary,
    ModelLibraryContext,
} from "../../frontend/src/model";
import { ModelNotebookEditor } from "../../frontend/src/model/model_editor";
import { ModelDocumentHead } from "../../frontend/src/model/model_info";
import { DocumentHead } from "../../frontend/src/page/document_head";
import { stdTheories } from "../../frontend/src/stdlib";
import { TheoryLibraryContext } from "../../frontend/src/theory";
import { rootFocus, useChildFocus } from "../../ui-components/src/util/focus";
import { version } from "../package.json";
import type { AnalysisDoc } from "./analysis_datatype";
import { createNotebookComments } from "./notebook_comments";
import { createNotebookDiff } from "./notebook_diff";

import "../../ui-components/src/global.css";

type ToolElement = HTMLElement & { repo: Repo };

/** Patchwork tool that shows a CatColab analysis side by side with its model.

The tool's document is the analysis; the model is resolved through the
analysis's `analysisOf` reference and rendered in the left pane, with the
analysis notebook in the right pane. Both panes are live and editable.
 */
export function renderAnalysisTool(handle: DocHandle<AnalysisDoc>, element: ToolElement) {
    return render(() => <AnalysisTool handle={handle} element={element} />, element);
}

export function AnalysisTool(props: { handle: DocHandle<AnalysisDoc>; element: ToolElement }) {
    // oxlint-disable-next-line solid/reactivity -- the host element and its repo are fixed for the tool's lifetime
    const modelLibrary = createModelLibraryWithRepo(props.element.repo, stdTheories);

    const [liveAnalysis] = createResource(
        () => props.handle.url,
        // oxlint-disable-next-line solid/reactivity -- the host element and its repo are fixed for the tool's lifetime
        (docUrl) => getLiveAnalysisFromRepo(docUrl, props.element.repo, modelLibrary),
    );

    return (
        <Switch>
            <Match when={liveAnalysis.loading}>
                <div style={messageStyle}>⏳ Loading analysis...</div>
            </Match>
            <Match when={liveAnalysis.error}>
                <div style={messageStyle}>
                    ❌ Error loading analysis: {liveAnalysis.error?.message || "Unknown error"}
                </div>
            </Match>
            <Match when={liveAnalysis()}>
                {(liveAnalysis) => (
                    <Switch
                        fallback={
                            <div style={messageStyle}>
                                Only analyses of models can be shown in Patchwork.
                            </div>
                        }
                    >
                        <Match when={asModelAnalysis(liveAnalysis())}>
                            {(modelAnalysis) => (
                                <TheoryLibraryContext.Provider value={stdTheories}>
                                    <ModelLibraryContext.Provider
                                        value={modelLibrary as ModelLibrary<string>}
                                    >
                                        <ModelAndAnalysisPanes
                                            modelAnalysis={modelAnalysis()}
                                            element={props.element}
                                        />
                                    </ModelLibraryContext.Provider>
                                </TheoryLibraryContext.Provider>
                            )}
                        </Match>
                    </Switch>
                )}
            </Match>
        </Switch>
    );
}

/** The model and its analysis side by side, each highlighting its changes
against the active draft's baseline.
 */
function ModelAndAnalysisPanes(props: {
    modelAnalysis: LiveModelAnalysisDoc;
    element: ToolElement;
}) {
    const { childFocus } = useChildFocus<"model" | "analysis">(rootFocus, { default: "model" });

    // oxlint-disable solid/reactivity -- the host element is fixed for the tool's lifetime
    const modelDiff = createNotebookDiff(
        props.element,
        () => props.modelAnalysis.liveModel.liveDoc.docHandle,
    );
    const analysisDiff = createNotebookDiff(
        props.element,
        () => props.modelAnalysis.liveDoc.docHandle,
    );
    const modelComments = createNotebookComments(
        props.element,
        () => props.modelAnalysis.liveModel.liveDoc.docHandle,
        () => props.modelAnalysis.liveModel.liveDoc.doc,
    );
    const analysisComments = createNotebookComments(
        props.element,
        () => props.modelAnalysis.liveDoc.docHandle,
        () => props.modelAnalysis.liveDoc.doc,
    );
    announceMounted(
        props.element,
        () => props.modelAnalysis.liveModel.liveDoc.docHandle.url,
        "catcolab-model",
    );
    // oxlint-enable solid/reactivity

    return (
        <div style={{ display: "flex", height: "100%", position: "relative" }}>
            <div style={versionStyle}>v{version}</div>
            <div
                style={{
                    ...paneStyle,
                    "border-right": "1px solid rgba(0, 0, 0, 0.15)",
                }}
            >
                <ModelDocumentHead liveModel={props.modelAnalysis.liveModel} />
                <ModelNotebookEditor
                    liveModel={props.modelAnalysis.liveModel}
                    focus={childFocus("model")}
                    diff={modelDiff()}
                    comments={modelComments}
                />
            </div>
            <div style={paneStyle}>
                <DocumentHead liveDoc={props.modelAnalysis.liveDoc} />
                <AnalysisNotebookEditor
                    liveAnalysis={props.modelAnalysis}
                    focus={childFocus("analysis")}
                    diff={analysisDiff()}
                    comments={analysisComments}
                />
            </div>
        </div>
    );
}

/** Tell Patchwork a document is shown here, as `<patchwork-view>` does for the
documents it mounts, so host services such as the comments provider watch it.
 */
function announceMounted(element: HTMLElement, url: Accessor<AutomergeUrl>, toolId: string) {
    createEffect(() => {
        const init = { detail: { url: url(), toolId }, bubbles: true, composed: true };
        element.dispatchEvent(new CustomEvent("patchwork:mounted", init));
        onCleanup(() => element.dispatchEvent(new CustomEvent("patchwork:unmounted", init)));
    });
}

function asModelAnalysis(liveAnalysis: LiveAnalysisDoc): LiveModelAnalysisDoc | undefined {
    return liveAnalysis.analysisType === "model" ? liveAnalysis : undefined;
}

const paneStyle = {
    flex: "1",
    "min-width": "0",
    overflow: "auto",
    padding: "52px 28px 28px",
};

const messageStyle = { padding: "52px" };

const versionStyle = {
    position: "absolute",
    right: "8px",
    bottom: "6px",
    "font-size": "11px",
    color: "rgba(0, 0, 0, 0.4)",
    "pointer-events": "none",
    "z-index": "1",
} as const;
