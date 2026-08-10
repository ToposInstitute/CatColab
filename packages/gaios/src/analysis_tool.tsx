import type { DocHandle, Repo } from "@automerge/automerge-repo";
import { createResource, Match, Switch } from "solid-js";
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
import type { AnalysisDoc } from "./analysis_datatype";

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

function AnalysisTool(props: { handle: DocHandle<AnalysisDoc>; element: ToolElement }) {
    // oxlint-disable-next-line solid/reactivity -- the host element and its repo are fixed for the tool's lifetime
    const modelLibrary = createModelLibraryWithRepo(props.element.repo, stdTheories);

    const [liveAnalysis] = createResource(
        () => props.handle.url,
        // oxlint-disable-next-line solid/reactivity -- the host element and its repo are fixed for the tool's lifetime
        (docUrl) => getLiveAnalysisFromRepo(docUrl, props.element.repo, modelLibrary),
    );

    const { childFocus } = useChildFocus<"model" | "analysis">(rootFocus, { default: "model" });

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
                                        <div style={{ display: "flex", height: "100%" }}>
                                            <div
                                                style={{
                                                    ...paneStyle,
                                                    "border-right": "1px solid rgba(0, 0, 0, 0.15)",
                                                }}
                                            >
                                                <ModelDocumentHead
                                                    liveModel={modelAnalysis().liveModel}
                                                />
                                                <ModelNotebookEditor
                                                    liveModel={modelAnalysis().liveModel}
                                                    focus={childFocus("model")}
                                                />
                                            </div>
                                            <div style={paneStyle}>
                                                <DocumentHead liveDoc={modelAnalysis().liveDoc} />
                                                <AnalysisNotebookEditor
                                                    liveAnalysis={modelAnalysis()}
                                                    focus={childFocus("analysis")}
                                                />
                                            </div>
                                        </div>
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
