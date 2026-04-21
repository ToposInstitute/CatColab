import type { DocHandle, Repo } from "@automerge/automerge-repo";
import { createResource, Switch, Match } from "solid-js";
import { render } from "solid-js/web";

import {
    createModelLibraryWithRepo,
    ModelLibraryContext,
    type ModelLibrary,
} from "../../frontend/src/model";
import { ModelNotebookEditor } from "../../frontend/src/model/model_editor";
import { ModelDocumentHead } from "../../frontend/src/model/model_info";
import { stdTheories } from "../../frontend/src/stdlib";
import { TheoryLibraryContext } from "../../frontend/src/theory";
import type { ModelDoc } from "./model_datatype";

import "../../ui-components/src/global.css";

type ToolElement = HTMLElement & { repo: Repo };

export function renderModelTool(handle: DocHandle<ModelDoc>, element: ToolElement) {
    const modelLibrary = createModelLibraryWithRepo(
        element.repo,
        stdTheories,
    ) as ModelLibrary<string>;

    const [liveModel] = createResource(
        () => handle.url,
        async (docUrl) => {
            try {
                return await modelLibrary.getLiveModel(docUrl);
            } catch (error) {
                console.error("=== Model Loading Failed ===");
                console.error("Error:", error);
                console.error("Stack:", (error as Error).stack);
                throw error;
            }
        },
    );

    return render(
        () => (
            <div style={{ padding: "52px", height: "100%", overflow: "scroll" }}>
                <Switch>
                    <Match when={liveModel.loading}>
                        <div>⏳ Loading model...</div>
                    </Match>
                    <Match when={liveModel.error}>
                        <div>
                            ❌ Error loading model: {liveModel.error?.message || "Unknown error"}
                        </div>
                    </Match>
                    <Match when={liveModel()}>
                        {(liveModel) => (
                            <TheoryLibraryContext.Provider value={stdTheories}>
                                <ModelLibraryContext.Provider value={modelLibrary}>
                                    <ModelDocumentHead liveModel={liveModel()} />
                                    <ModelNotebookEditor liveModel={liveModel()} />
                                </ModelLibraryContext.Provider>
                            </TheoryLibraryContext.Provider>
                        )}
                    </Match>
                </Switch>
            </div>
        ),
        element,
    );
}
