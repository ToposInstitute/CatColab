/** @jsxRuntime automatic */
/** @jsxImportSource solid-js */
/* eslint-disable react/no-unknown-property */

import { createResource, Show } from "solid-js";
import type { Repo } from "@automerge/automerge-repo";

import { ApiContext } from "../../src/api";
import { stdTheories, TheoryLibraryContext } from "../../src/stdlib";
import { getLiveAnalysis } from "../../src/analysis";
import {
    AnalysisDocumentEditor,
    AnalysisNotebookEditor,
} from "../../src/analysis/analysis_editor";

interface AnalysisPaneProps {
    docUrl: string;
    repo: Repo;
}

export function AnalysisPaneComponent(props: AnalysisPaneProps) {
    const api = { repo: props.repo };
    const [liveAnalysis] = createResource(
        () => props.docUrl,
        async (refId) => {
            try {
                const result = await getLiveAnalysis(refId, api, stdTheories);
                return result;
            } catch (error) {
                throw error;
            }
        }
    );

    return (
        <div>
            <div>
                <Show when={liveAnalysis.loading}>
                    <div>⏳ Loading analysis...</div>
                </Show>
                <Show when={liveAnalysis.error}>
                    <div>
                        ❌ Error loading model:{" "}
                        {liveAnalysis.error?.message || "Unknown error"}
                    </div>
                </Show>
                <Show
                    when={
                        liveAnalysis() &&
                        !liveAnalysis.loading &&
                        !liveAnalysis.error
                    }
                >
                    {(loadedAnalysis) => {
                        // Provide contexts using SAME import paths as ModelPane
                        return (
                            <ApiContext.Provider value={api}>
                                <TheoryLibraryContext.Provider
                                    value={stdTheories}
                                >
                                    <AnalysisNotebookEditor
                                        liveAnalysis={liveAnalysis()}
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
