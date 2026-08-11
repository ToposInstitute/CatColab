import type { DocHandle, Repo } from "@automerge/automerge-repo";
import { createResource, Switch, Match } from "solid-js";
import { render } from "solid-js/web";

import { newAnalysisDocument } from "../../frontend/src/analysis";
import {
    createModelLibraryWithRepo,
    ModelLibraryContext,
    type ModelLibrary,
} from "../../frontend/src/model";
import { ModelNotebookEditor } from "../../frontend/src/model/model_editor";
import { ModelDocumentHead } from "../../frontend/src/model/model_info";
import { stdTheories } from "../../frontend/src/stdlib";
import { TheoryLibraryContext } from "../../frontend/src/theory";
import { rootFocus } from "../../ui-components/src/util/focus";
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
                                    <div style={{ display: "flex", "justify-content": "flex-end" }}>
                                        <button
                                            type="button"
                                            onClick={() => openNewAnalysis(handle, element)}
                                        >
                                            New analysis
                                        </button>
                                    </div>
                                    <ModelDocumentHead liveModel={liveModel()} />
                                    <ModelNotebookEditor
                                        liveModel={liveModel()}
                                        focus={rootFocus}
                                    />
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

/** Patchwork metadata carried inside a document under the `@patchwork` key. */
type PatchworkMetadata = {
    type?: string;
    suggestedImportUrl?: string;
    frozenImportUrl?: string;
    title?: string;
};

type WithPatchworkMetadata<T> = T & { "@patchwork"?: PatchworkMetadata };

/** Create a new analysis of the model and open it in the analysis tool.

The analysis lives in its own Automerge document that references the model
through its `analysisOf` field, mirroring how CatColab's own backend links the
two. `_server` is empty because documents here live in the Patchwork repo
rather than on a CatColab server.
 */
async function openNewAnalysis(handle: DocHandle<ModelDoc>, element: ToolElement) {
    const analysisDoc = newAnalysisDocument("model", {
        _id: handle.url,
        _version: null,
        _server: "",
    });

    // Patchwork resolves a doc's tool from the doc's own metadata: `type` names
    // the datatype and the import URLs say where to load the plugin from. Copy
    // the import URLs from the model so both docs use the same plugin build.
    const modelMeta = (handle.doc() as WithPatchworkMetadata<ModelDoc>)["@patchwork"];
    const docWithMeta: WithPatchworkMetadata<typeof analysisDoc> = {
        ...analysisDoc,
        "@patchwork": {
            type: "catcolab-analysis",
            ...(modelMeta?.suggestedImportUrl && {
                suggestedImportUrl: modelMeta.suggestedImportUrl,
            }),
            ...(modelMeta?.frozenImportUrl && {
                frozenImportUrl: modelMeta.frozenImportUrl,
            }),
        },
    };

    const analysisHandle = await element.repo.create2(docWithMeta);
    element.dispatchEvent(
        new CustomEvent("patchwork:open-document", {
            detail: { url: analysisHandle.url, toolId: "catcolab-analysis" },
            bubbles: true,
            composed: true,
        }),
    );
}
