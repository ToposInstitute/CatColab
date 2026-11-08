import type { DiagramAnalysisPlugin } from "../../plugin";

export const plugins = [
    {
        id: "diagram-tabular-view",
        name: "Table view",
        description: "Visualize the instance as a table",
        help: "tabularview",
        type: "diagram",
        scope: {
            theory: ["simple-schema"],
        },
        load: async () => (await import("./tabular_view")).default,
    } satisfies DiagramAnalysisPlugin,
];
