import type { ModelAnalysisContribution, Plugin } from "../../plugin";

const contributions = [
    {
        name: "composition-pattern",
        label: "Composition pattern",
        description:
            "Visualize the composition pattern of the model as an undirected wiring diagram",
        help: "composition-pattern",
        analysisType: "model",
        scope: {}, // Applicable to any model.
        load: async () => (await import("./uwd_visualization")).default,
    } satisfies ModelAnalysisContribution,
];

export default {
    namespace: "std",
    name: "uwd-visualization",
    contributions,
} satisfies Plugin;
