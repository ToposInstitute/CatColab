import { createResource, Show } from "solid-js";

import { ApiContext } from "../../frontend/src/api";
import { getLiveModel } from "../../frontend/src/model/document";
import { ModelPane } from "../../frontend/src/model/model_editor";
import { stdTheories, TheoryLibraryContext } from "../../frontend/src/stdlib";
import { AnnotationsContext } from "./annotations_solid";
import type { SolidToolProps } from "./tools";

export function ModelPaneComponent(props: SolidToolProps) {
    // Typescript gets confused because the patchwork and the frontend package both import "@automerge/automerge-repo" in their package.json
    const api = { repo: props.repo as any };

    const [liveModel] = createResource(
        () => props.docUrl,
        async (refId) => {
            try {
                return await getLiveModel(refId, api, stdTheories);
            } catch (error) {
                console.error("=== Model Loading Failed ===");
                console.error("Error:", error);
                console.error("Stack:", (error as Error).stack);
                throw error;
            }
        },
    );

    const isLoading = () => liveModel.loading || !liveModel();

    const hasError = () => liveModel.error;

    return (
        <div>
            <div>
                <Show when={isLoading()}>
                    <div>⏳ Loading model...</div>
                </Show>
                <Show when={hasError()}>
                    <Show when={liveModel.error}>
                        <div>
                            ❌ Error loading model: {liveModel.error?.message || "Unknown error"}
                        </div>
                    </Show>
                </Show>
                <Show when={!isLoading()}>
                    {(_) => {
                        return (
                            <AnnotationsContext.Provider value={props.annotationsContextValue}>
                                <ApiContext.Provider value={api}>
                                    <TheoryLibraryContext.Provider value={stdTheories}>
                                        <ModelPane liveModel={liveModel()!} />
                                    </TheoryLibraryContext.Provider>
                                </ApiContext.Provider>
                            </AnnotationsContext.Provider>
                        );
                    }}
                </Show>
            </div>
        </div>
    );
}
