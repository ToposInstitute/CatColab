import type { DocHandle } from "@automerge/automerge-repo";
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

import styles from "../../ui-components/src/global.css?inline";

// `element` carries a `Repo` from the patchwork host, whose automerge-repo
// version differs from the one the frontend package was built against. Typed
// loosely here to avoid the version-skew type clash; structurally identical.
type ToolElement = HTMLElement & { repo: unknown };

export function renderModelTool(handle: DocHandle<ModelDoc>, element: ToolElement) {
    // Cast: `createModelLibraryWithRepo` returns `ModelLibrary<AnyDocumentId>`,
    // but the context is typed as `ModelLibrary<string>`. `AnyDocumentId` is a
    // branded string, so the narrowing is safe here. The `repo` is also cast
    // through `unknown` because gaios and frontend resolve different pinned
    // versions of @automerge/automerge-repo; the types clash but the runtime
    // shapes are compatible.
    const modelLibrary = createModelLibraryWithRepo(
        // oxlint-disable-next-line typescript/no-explicit-any -- version-skew workaround
        element.repo as any,
        stdTheories,
    ) as unknown as ModelLibrary<string>;

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

    const sheet = new CSSStyleSheet();
    sheet.replaceSync(styles);
    document.adoptedStyleSheets ??= [];
    if (!document.adoptedStyleSheets.includes(sheet)) {
        document.adoptedStyleSheets.push(sheet);
    }

    // oxlint-disable-next-line no-console -- intentional startup diagnostic
    console.log("Hello from CatColab");

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
