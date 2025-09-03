import type { Plugin } from "@patchwork/sdk/plugins";
import { stockFlowAIPrompt } from "./ai-prompt";
import type { LoadableAnnotationPlugin } from "@patchwork/sdk/annotations";

export const plugins: Plugin<any>[] = [
    {
        type: "patchwork:dataType",
        id: "catcolab-model",
        name: "CatColab Model",
        icon: "Zap",
        async load() {
            const { dataType } = await import("./model_datatype");
            return dataType;
        },
    },
    {
        type: "patchwork:dataType",
        id: "catcolab-analysis",
        name: "CatColab Analysis",
        icon: "BarChart3",
        async load() {
            const { dataType } = await import("./analysis_datatype");
            return dataType;
        },
        unlisted: true,
    },
    // {
    //     type: "patchwork:tool",
    //     id: "catcolab-model-view",
    //     name: "Model",
    //     icon: "Zap",
    //     supportedDataTypes: ["catcolab-model"],
    //     async load() {
    //         const { ModelTool } = await import("./tools");

    //         return {
    //             EditorComponent: ModelTool,
    //         };
    //     },
    // },
    // {
    //     type: "patchwork:tool",
    //     id: "catcolab-model-analysis-view",
    //     name: "Analysis",
    //     icon: "Zap",
    //     supportedDataTypes: ["catcolab-model"],
    //     async load() {
    //         const { AnalysisTool } = await import("./tools");

    //         return {
    //             EditorComponent: AnalysisTool,
    //         };
    //     },
    // },
    {
        type: "patchwork:tool",
        id: "catcolab-model-side-by-side-view-evan",
        name: "CatColab (Evan)",
        icon: "Zap",
        supportedDataTypes: ["catcolab-model"],
        async load() {
            const { SideBySideTool } = await import("./tools");
            return {
                EditorComponent: SideBySideTool,
            };
        },
    },
    stockFlowAIPrompt,
    {
        type: "patchwork:annotations",
        name: "Model Annotations (Evan)",
        id: "model-annotations-evan",
        supportedDataTypes: ["catcolab-model"],
        async load() {
            const { plugin } = await import("./model_annotations");
            return plugin;
        },
    } as LoadableAnnotationPlugin,
    {
        type: "patchwork:annotations",
        name: "Analysis Annotations (Evan)",
        id: "analysis-annotations-evan",
        supportedDataTypes: ["catcolab-analysis"],
        async load() {
            const { plugin } = await import("./analysis_annotations");
            return plugin;
        },
    } as LoadableAnnotationPlugin,
];
