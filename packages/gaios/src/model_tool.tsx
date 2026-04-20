import type { AutomergeUrl, DocHandle, Repo } from "@automerge/automerge-repo";
import { createResource, Switch, Match } from "solid-js";

import { createModelLibraryWithRepo } from "../../frontend/src/model";
import { ModelNotebookEditor } from "../../frontend/src/model/model_editor";
import { stdTheories } from "../../frontend/src/stdlib";
import { TheoryLibraryContext } from "../../frontend/src/theory";
import type { ModelDoc } from "./model_datatype";
import { render } from "solid-js/web";
import styles from "../../ui-components/src/global.css?inline";

export function renderModelTool(handle: DocHandle<ModelDoc>, element: any) {
    const modelLibrary = createModelLibraryWithRepo(element.repo, stdTheories);

    const [liveModel] = createResource(
        () => handle.url,
        async (docUrl) => {
            try {
                return await modelLibrary.getLiveModel(docUrl as AutomergeUrl);
            } catch (error) {
                console.error("=== Model Loading Failed ===");
                console.error("Error:", error);
                console.error("Stack:", (error as Error).stack);
                throw error;
            }
        }
    );

    const sheet = new CSSStyleSheet();
    sheet.replaceSync(styles as string);
    document.adoptedStyleSheets ??= [];
    if (!document.adoptedStyleSheets.includes(sheet)) {
        document.adoptedStyleSheets.push(sheet);
    }

    return render(
        () => (
            <div style="padding: 52px; height: 100%; overflow: scroll;">
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
                                <ModelNotebookEditor liveModel={liveModel()} />
                            </TheoryLibraryContext.Provider>
                        )}
                    </Match>
                </Switch>
            </div>
        ),
        element,
    );
}
