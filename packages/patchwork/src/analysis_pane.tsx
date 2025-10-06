import type { AutomergeUrl } from "@automerge/automerge-repo";
import { createResource, Switch, Match } from "solid-js";

import { getLiveAnalysisFromRepo } from "../../frontend/src/analysis";
import { AnalysisNotebookEditor } from "../../frontend/src/analysis/analysis_editor";
import { stdTheories, TheoryLibraryContext } from "../../frontend/src/stdlib";
import type { SolidToolProps } from "./tools";

export function AnalysisPaneComponent(props: SolidToolProps) {
    const [liveAnalysis] = createResource(
        () => props.docUrl,
        (docUrl) => getLiveAnalysisFromRepo(docUrl as AutomergeUrl, props.repo, stdTheories),
    );

    return (
        <div>
            <Switch>
                <Match when={liveAnalysis.loading}>
                    <div>⏳ Loading analysis...</div>
                </Match>
                <Match when={liveAnalysis.error}>
                    <div>
                        ❌ Error loading model: {liveAnalysis.error?.message || "Unknown error"}
                    </div>
                </Match>
                <Match when={liveAnalysis()}>
                    {(liveAnalysis) => (
                        <TheoryLibraryContext.Provider value={stdTheories}>
                            <AnalysisNotebookEditor liveAnalysis={liveAnalysis()} />
                        </TheoryLibraryContext.Provider>
                    )}
                </Match>
            </Switch>
        </div>
    );
}
