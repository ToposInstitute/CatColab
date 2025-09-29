import type { AutomergeUrl, DocHandle, Repo } from "@automerge/automerge-repo";
import { createResource, Switch, Match } from "solid-js";

import { getLiveModelFromRepo } from "../../frontend/src/model";
import { ModelPane } from "../../frontend/src/model/model_editor";
import { stdTheories, TheoryLibraryContext } from "../../frontend/src/stdlib";
import type { ModelDoc } from "./model_datatype";
import { render } from "solid-js/web";

type ModelToolProps = {
    handle: DocHandle<ModelDoc>;
    element: ShadowRoot | HTMLElement;
    repo: Repo;
};

export function renderModelTool({ handle, element, repo }: ModelToolProps) {
    const [liveModel] = createResource(
        () => handle.url,
        async (docUrl) => {
            try {
                return await getLiveModelFromRepo(
                    docUrl as AutomergeUrl,
                    repo,
                    stdTheories
                );
            } catch (error) {
                console.error("=== Model Loading Failed ===");
                console.error("Error:", error);
                console.error("Stack:", (error as Error).stack);
                throw error;
            }
        }
    );

    return render(
        () => (
            <div>
                <Switch>
                    <Match when={liveModel.loading}>
                        <div>⏳ Loading model...</div>
                    </Match>
                    <Match when={liveModel.error}>
                        <div>
                            ❌ Error loading model:{" "}
                            {liveModel.error?.message || "Unknown error"}
                        </div>
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
        ),
        element
    );
}
