import type { AutomergeUrl, DocHandle } from "@automerge/automerge-repo";
import styles from "catcolab-ui-components/global.css?inline";
import { createModelLibraryWithRepo } from "frontend/src/model";
import { ModelNotebookEditor } from "frontend/src/model/model_editor";
import { stdTheories } from "frontend/src/stdlib";
import { TheoryLibraryContext } from "frontend/src/theory";
import { createResource, Match, Switch } from "solid-js";
import { render } from "solid-js/web";

import type { ModelDoc } from "./model_datatype";

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
        },
    );

    const shadowRoot = element.attachShadow({ mode: "open" });

    // hack: vite currently injects styles into the head of the document
    // because of the shadow dom we no longer get these styles
    // for now we just copy them into the shadow root
    for (const node of document.querySelectorAll("style,link[rel='stylesheet']")) {
        shadowRoot.append(node.cloneNode(true));
    }

    const sheet = new CSSStyleSheet();
    sheet.replaceSync(styles as string);
    shadowRoot.adoptedStyleSheets ??= [];
    shadowRoot.adoptedStyleSheets.push(sheet);

    return render(
        () => (
            <div style="padding: 52px; height: 100%; overflow: scroll;">
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
                                <ModelNotebookEditor liveModel={liveModel()} />
                            </TheoryLibraryContext.Provider>
                        )}
                    </Match>
                </Switch>
            </div>
        ),
        shadowRoot,
    );
}
