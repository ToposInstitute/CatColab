import {
    createSignal,
    onMount,
    createResource,
    Show,
    useContext,
} from "solid-js";

// Import the actual model editor components
import { useApi } from "../../src/api";
import { TheoryLibraryContext, stdTheories } from "../../src/stdlib";
import { DocumentLoadingScreen } from "../../src/page";
import { ModelPane } from "../../src/model/model_editor";
import { getLiveModel } from "../../src/model/document";

interface SolidComponentProps {
    docUrl: string;
    name: string;
    theory: string;
    notebook: any;
}

export function SolidComponent(props: SolidComponentProps) {
    const [mounted, setMounted] = createSignal(false);

    onMount(() => {
        setMounted(true);
        console.log("Model editor component mounted with props:", props);
    });

    // Get the API and theories context
    const api = useApi();
    const theories = stdTheories;

    const [liveModel] = createResource(
        () => props.docUrl,
        (refId) => getLiveModel(refId, api, theories)
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
                </div>
            </div>

            {/* Model Editor */}
            <Show when={liveModel()} fallback={<DocumentLoadingScreen />}>
                {(loadedModel) => (
                    <TheoryLibraryContext.Provider value={theories}>
                        <ModelPane liveModel={loadedModel()} />
                    </TheoryLibraryContext.Provider>
                )}
            </Show>

            {/* Footer */}
            <div style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
                <strong>Note:</strong> This is the full CatColab model editor
                running in SolidJS within a React/Patchwork environment.
            </div>
        </div>
    );
}
