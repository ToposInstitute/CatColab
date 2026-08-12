import type { DocHandle, Repo } from "@automerge/automerge-repo";
import { createResource, Match, Switch } from "solid-js";
import { render } from "solid-js/web";

import { newAnalysisDocument } from "../../frontend/src/analysis";
import type { AnalysisDoc } from "./analysis_datatype";
import { AnalysisTool } from "./analysis_tool";
import type { ModelDoc } from "./model_datatype";

import "../../ui-components/src/global.css";

type ToolElement = HTMLElement & { repo: Repo };

/** Patchwork tool for CatColab models.

Every model is paired with a linked analysis document: on first open the tool
creates the analysis and records its URL in the model's `analysisDocUrl`
field; on later opens it resolves the recorded URL. The tool then renders the
side-by-side model/analysis view, so a model is never shown without its
analysis.
 */
export function renderModelTool(handle: DocHandle<ModelDoc>, element: ToolElement) {
    const [analysisHandle] = createResource(
        () => handle.url,
        // oxlint-disable-next-line solid/reactivity -- the host element and its repo are fixed for the tool's lifetime
        () => ensureLinkedAnalysis(handle, element.repo),
    );

    return render(
        () => (
            <Switch>
                <Match when={analysisHandle.loading}>
                    <div style={messageStyle}>⏳ Loading model...</div>
                </Match>
                <Match when={analysisHandle.error}>
                    <div style={messageStyle}>
                        ❌ Error loading analysis:{" "}
                        {analysisHandle.error?.message || "Unknown error"}
                    </div>
                </Match>
                <Match when={analysisHandle()}>
                    {(analysisHandle) => (
                        <AnalysisTool handle={analysisHandle()} element={element} />
                    )}
                </Match>
            </Switch>
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

/** Get the analysis document linked to the model, creating it if necessary.

The analysis lives in its own Automerge document that references the model
through its `analysisOf` field, mirroring how CatColab's own backend links the
two. `_server` is empty because documents here live in the Patchwork repo
rather than on a CatColab server. The model records the analysis's URL in its
`analysisDocUrl` field so the pair is created only once.
 */
async function ensureLinkedAnalysis(
    handle: DocHandle<ModelDoc>,
    repo: Repo,
): Promise<DocHandle<AnalysisDoc>> {
    const analysisUrl = handle.doc().analysisDocUrl;
    if (analysisUrl) {
        return await repo.find<AnalysisDoc>(analysisUrl);
    }

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

    const analysisHandle = await repo.create2(docWithMeta);
    handle.change((doc) => {
        doc.analysisDocUrl = analysisHandle.url;
    });
    return analysisHandle;
}

const messageStyle = { padding: "52px" };
