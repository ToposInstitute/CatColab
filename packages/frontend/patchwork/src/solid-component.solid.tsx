import { createSignal, onMount, createResource, Show } from "solid-js";

// Import the actual model editor components
import { ApiContext } from "../../src/api";
import { TheoryLibraryContext, stdTheories } from "../../src/stdlib";
import { DocumentLoadingScreen } from "../../src/page";
import { ModelPane } from "../../src/model/model_editor";
import { getLiveModel } from "../../src/model/document";

interface SolidComponentProps {
    docUrl: string;
    name: string;
    theory: string;
    notebook: any;
    repo: any;
}

export function SolidComponent(props: SolidComponentProps) {
    const [mounted, setMounted] = createSignal(false);

    onMount(() => {
        setMounted(true);
        console.log("Model editor component mounted with props:", props);
        console.log("Repo:", props.repo);
        console.log("Theories:", stdTheories);
    });

    // Create the API object from the repo
    const api = { repo: props.repo };
    const theories = stdTheories;

    const [liveModel] = createResource(
        () => props.docUrl,
        async (refId) => {
            console.log("Loading model with refId:", refId);
            try {
                const result = await getLiveModel(refId, api, theories);
                console.log("Model loaded:", result);
                return result;
            } catch (error) {
                console.error("Failed to load model:", error);
                throw error;
            }
        }
    );

    return (
        <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb;">
            {/* Header */}
            <div style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">
                <h3 style="font-size: 18px; font-weight: bold; color: #1f2937; margin: 0 0 8px 0;">
                    📊 CatColab Model Editor
                </h3>
                <div style="display: flex; gap: 16px; font-size: 14px; color: #6b7280;">
                    <span>
                        <strong>Status:</strong>{" "}
                        {mounted() ? "✅ Ready" : "⏳ Loading"}
                    </span>
                    <span>
                        <strong>Theory:</strong> {props.theory}
                    </span>
                    <span>
                        <strong>API:</strong>{" "}
                        {api ? "✅ Connected" : "❌ Missing"}
                    </span>
                </div>
            </div>

            {/* Model Editor with proper contexts */}
            <ApiContext.Provider value={api}>
                <TheoryLibraryContext.Provider value={theories}>
                    <Show when={liveModel.loading}>
                        <div style="padding: 20px; text-align: center; color: #6b7280;">
                            ⏳ Loading model...
                        </div>
                    </Show>
                    <Show when={liveModel.error}>
                        <div style="padding: 20px; text-align: center; color: #dc2626; background: #fef2f2; border-radius: 4px;">
                            ❌ Error loading model:{" "}
                            {liveModel.error?.message || "Unknown error"}
                        </div>
                    </Show>
                    <Show
                        when={
                            liveModel() &&
                            !liveModel.loading &&
                            !liveModel.error
                        }
                    >
                        {(loadedModel) => (
                            <ModelPane liveModel={loadedModel()} />
                        )}
                    </Show>
                </TheoryLibraryContext.Provider>
            </ApiContext.Provider>

            {/* Footer */}
            <div style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
                <strong>Note:</strong> This is the full CatColab model editor
                running in SolidJS within a React/Patchwork environment.
                <br />
                <strong>Debug:</strong> docUrl = "{props.docUrl}"
            </div>
        </div>
    );
}
