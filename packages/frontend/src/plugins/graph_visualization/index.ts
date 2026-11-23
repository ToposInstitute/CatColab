import type { DiagramAnalysisContribution, ModelAnalysisContribution, Plugin } from "../../plugin";

const contributions = [
    {
        name: "model",
        label: "Visualization",
        description: "Visualize the model as a graph",
        help: "visualization",
        analysisType: "model",
        scope: {
            doctrine: ["discrete"],
        },
        load: async () => (await import("./model_graph")).default,
    } satisfies ModelAnalysisContribution,
    {
        name: "diagram",
        label: "Visualization",
        description: "Visualize the diagram as a graph",
        analysisType: "diagram",
        scope: {
            doctrine: ["discrete"],
        },
        load: async () => (await import("./diagram_graph")).default,
    } satisfies DiagramAnalysisContribution,
    {
        name: "petri-net",
        label: "Visualization",
        description: "Visualize the Petri net",
        analysisType: "model",
        scope: {
            theory: ["petri-net"],
        },
        load: async () => (await import("./petri_net_visualization")).default,
    } satisfies ModelAnalysisContribution,
    {
        name: "stock-flow",
        label: "Visualization",
        description: "Visualize the diagram",
        analysisType: "model",
        scope: {
            theory: ["primitive-stock-flow", "primitive-signed-stock-flow"],
        },
        load: async () => (await import("./stock_flow_diagram")).default,
    } satisfies ModelAnalysisContribution,
];

export default {
    namespace: "std",
    name: "graph-visualization",
    contributions,
} satisfies Plugin;
