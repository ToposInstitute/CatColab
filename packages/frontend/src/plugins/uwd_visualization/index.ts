import type { ModelAnalysisPlugin } from "../../plugin";

export const plugins = [
    {
        id: "composition-pattern",
        name: "Composition pattern",
        description:
            "Visualize the composition pattern of the model as an undirected wiring diagram",
        help: "composition-pattern",
        type: "model",
        scope: {}, // Applicable to any model.
        load: async () => (await import("./uwd_visualization")).default,
    } satisfies ModelAnalysisPlugin,
];
