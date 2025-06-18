import { createSignal, onMount, createResource, Show } from "solid-js";

// Import contexts using the SAME import path as ModelPane uses
import { ApiContext } from "../../src/api";
import { TheoryLibraryContext } from "../../src/stdlib";
import { LiveModelContext } from "../../src/model/context";
import { ModelPane } from "../../src/model/model_editor";
import { getLiveModel } from "../../src/model/document";

interface SolidComponentProps {
    docUrl: string;
    name: string;
    theory: string;
    notebook: any;
    repo: any;
    api: any; // Context values passed as props
    theories: any; // Context values passed as props
}

export function SolidComponent(props: SolidComponentProps) {
    const [mounted, setMounted] = createSignal(false);

    onMount(() => {
        setMounted(true);
        console.log("=== SolidComponent Mount (Same Import Paths) ===");
        console.log("Props:", props);
        console.log("API prop:", props.api);
        console.log("Theories prop:", props.theories);
        console.log(
            "Theories metadata count:",
            props.theories ? Array.from(props.theories.metadata()).length : 0
        );

        // Debug context identity
        console.log("=== Context Identity Debug ===");
        console.log("TheoryLibraryContext identity:", TheoryLibraryContext);
        console.log("ApiContext identity:", ApiContext);
        console.log("LiveModelContext identity:", LiveModelContext);
    });

    const [liveModel] = createResource(
        () => props.docUrl,
        async (refId) => {
            try {
                console.log("=== Loading Model (Same Import Paths) ===");
                console.log("RefId:", refId);
                console.log("API from props:", props.api);
                console.log("Theories from props:", props.theories);

                const result = await getLiveModel(
                    refId,
                    props.api,
                    props.theories
                );
                console.log("=== Model Loaded Successfully ===");
                console.log("Result:", result);
                return result;
            } catch (error) {
                console.error("=== Model Loading Failed ===");
                console.error("Error:", error);
                console.error("Stack:", (error as Error).stack);
                throw error;
            }
        }
    );

    return (
        <div>
            <div>
                <h3>🧪 Context Identity Debug</h3>
            </div>

            <div>
                <div>
                    <strong>Context Test (From Props):</strong>
                    <div>API: {props.api ? "✅ Available" : "❌ Missing"}</div>
                    <div>
                        Theories:{" "}
                        {props.theories ? "✅ Available" : "❌ Missing"}
                    </div>
                    <div>
                        Theory Count:{" "}
                        {props.theories
                            ? Array.from(props.theories.metadata()).length
                            : 0}
                    </div>
                </div>

                <Show when={liveModel.loading}>
                    <div>⏳ Loading model...</div>
                </Show>
                <Show when={liveModel.error}>
                    <div>
                        ❌ Error loading model:{" "}
                        {liveModel.error?.message || "Unknown error"}
                    </div>
                </Show>
                <Show
                    when={liveModel() && !liveModel.loading && !liveModel.error}
                >
                    {(loadedModel) => {
                        console.log(
                            "=== Rendering ModelPane (Context Identity Debug) ==="
                        );
                        console.log("LoadedModel:", loadedModel());
                        console.log("About to provide contexts...");
                        console.log(
                            "TheoryLibraryContext (provider):",
                            TheoryLibraryContext
                        );
                        console.log("ApiContext (provider):", ApiContext);
                        console.log(
                            "LiveModelContext (provider):",
                            LiveModelContext
                        );
                        console.log(
                            "Providing theories value:",
                            props.theories
                        );
                        console.log("Providing api value:", props.api);

                        // Provide contexts using SAME import paths as ModelPane
                        return (
                            <ApiContext.Provider value={props.api}>
                                <TheoryLibraryContext.Provider
                                    value={props.theories}
                                >
                                    <LiveModelContext.Provider
                                        value={() => loadedModel()}
                                    >
                                        <ModelPane liveModel={loadedModel()} />
                                    </LiveModelContext.Provider>
                                </TheoryLibraryContext.Provider>
                            </ApiContext.Provider>
                        );
                    }}
                </Show>
            </div>
        </div>
    );
}
