import { createResource, Show } from "solid-js";

import { getLiveAnalysis, type LiveAnalysisDocument } from "../../frontend/src/analysis";
import { AnalysisNotebookEditor } from "../../frontend/src/analysis/analysis_editor";
import { ApiContext } from "../../frontend/src/api";
import { stdTheories, TheoryLibraryContext } from "../../frontend/src/stdlib";
import type { SolidToolProps } from "./tools";

export function AnalysisPaneComponent(props: SolidToolProps) {
    // Typescript gets confused because the patchwork and the frontend package both import "@automerge/automerge-repo" in their package.json
    const api = { repo: props.repo as any };
    const [liveAnalysis] = createResource(
        () => props.docUrl,
        async (refId) => {
            try {
                const result = await getLiveAnalysis(refId, api, stdTheories);
                return result;
            } catch (error) {
                throw error;
            }
        },
    );

    return (
        <div>
            <div>
                <Show when={liveAnalysis.loading}>
                    <div>⏳ Loading analysis...</div>
                </Show>
                <Show when={liveAnalysis.error}>
                    <div>
                        ❌ Error loading model: {liveAnalysis.error?.message || "Unknown error"}
                    </div>
                </Show>
                <Show when={liveAnalysis() && !liveAnalysis.loading && !liveAnalysis.error}>
                    {(_) => {
                        // Provide contexts using SAME import paths as ModelPane
                        return (
                            <ApiContext.Provider value={api}>
                                <TheoryLibraryContext.Provider value={stdTheories}>
                                    <AnalysisNotebookEditor
                                        liveAnalysis={liveAnalysis() as LiveAnalysisDocument}
                                    />
                                </TheoryLibraryContext.Provider>
                            </ApiContext.Provider>
                        );
                    }}
                </Show>
            </div>
        </div>
    );
}
