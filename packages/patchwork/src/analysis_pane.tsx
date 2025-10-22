import type { AutomergeUrl } from "@automerge/automerge-repo";
import { MultiProvider } from "@solid-primitives/context";
import { createResource, Switch, Match } from "solid-js";

import { getLiveAnalysisFromRepo } from "../../frontend/src/analysis";
import { AnalysisNotebookEditor } from "../../frontend/src/analysis/analysis_editor";
import { createModelLibraryWithRepo, ModelLibraryContext } from "../../frontend/src/model";
import { TheoryLibraryContext } from "../../frontend/src/theory";
import { stdTheories } from "../../frontend/src/stdlib";
import type { SolidToolProps } from "./tools";

export function AnalysisPaneComponent(props: SolidToolProps) {
    const models = createModelLibraryWithRepo(props.repo, stdTheories);

    const [liveAnalysis] = createResource(
        () => props.docUrl,
        (docUrl) => getLiveAnalysisFromRepo(docUrl as AutomergeUrl, props.repo, models),
    );

    return (
        <MultiProvider
            values={[
                [TheoryLibraryContext, stdTheories],
                [ModelLibraryContext, models],
            ]}
        >
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
                    {(liveAnalysis) => <AnalysisNotebookEditor liveAnalysis={liveAnalysis()} />}
                </Match>
            </Switch>
        </MultiProvider>
    );
}
