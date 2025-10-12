import type { AutomergeUrl } from "@automerge/automerge-repo";
import { createResource, Switch, Match } from "solid-js";

import { getLiveModelFromRepo } from "../../frontend/src/model";
import { ModelPane } from "../../frontend/src/model/model_editor";
import { TheoryLibraryContext } from "../../frontend/src/theory";
import { stdTheories } from "../../frontend/src/stdlib";
import type { SolidToolProps } from "./tools";

export function ModelPaneComponent(props: SolidToolProps) {
    const [liveModel] = createResource(
        () => props.docUrl,
        async (docUrl) => {
            try {
                return await getLiveModelFromRepo(docUrl as AutomergeUrl, props.repo, stdTheories);
            } catch (error) {
                console.error("=== Model Loading Failed ===");
                console.error("Error:", error);
                console.error("Stack:", (error as Error).stack);
                throw error;
            }
        },
    );

    return (
        <div>
            <Switch>
                <Match when={liveModel.loading}>
                    <div>⏳ Loading model...</div>
                </Match>
                <Match when={liveModel.error}>
                    <div>❌ Error loading model: {liveModel.error?.message || "Unknown error"}</div>
                </Match>
                <Match when={liveModel()}>
                    {(liveModel) => (
                        <TheoryLibraryContext.Provider value={stdTheories}>
                            <ModelPane liveModel={liveModel()} />
                        </TheoryLibraryContext.Provider>
                    )}
                </Match>
            </Switch>
        </div>
    );
}
