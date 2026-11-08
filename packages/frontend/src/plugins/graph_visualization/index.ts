import type { DiagramAnalysisPlugin, ModelAnalysisPlugin } from "../../plugin";

export const plugins = [
    {
        id: "model-graph-visualization",
        name: "Visualization",
        description: "Visualize the model as a graph",
        help: "visualization",
        type: "model",
        scope: {
            doctrine: ["discrete"],
        },
        load: async () => (await import("./model_graph")).default,
    } satisfies ModelAnalysisPlugin,
    {
        id: "diagram-graph-visualization",
        name: "Visualization",
        description: "Visualize the diagram as a graph",
        type: "diagram",
        scope: {
            doctrine: ["discrete"],
        },
        load: async () => (await import("./diagram_graph")).default,
    } satisfies DiagramAnalysisPlugin,
    {
        id: "petri-net-visualization",
        name: "Visualization",
        description: "Visualize the Petri net",
        type: "model",
        scope: {
            theory: ["petri-net"],
        },
        load: async () => (await import("./petri_net_visualization")).default,
    } satisfies ModelAnalysisPlugin,
    {
        id: "stock-flow-visualization",
        name: "Visualization",
        description: "Visualize the diagram",
        type: "model",
        scope: {
            theory: ["primitive-stock-flow"],
        },
        load: async () => (await import("./stock_flow_diagram")).default,
    } satisfies ModelAnalysisPlugin,
];
