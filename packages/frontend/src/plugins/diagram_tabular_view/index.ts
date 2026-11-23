import type { DiagramAnalysisContribution, Plugin } from "../../plugin";

const contributions = [
    {
        name: "view",
        label: "Table view",
        description: "Visualize the instance as a table",
        help: "tabularview",
        analysisType: "diagram",
        scope: {
            theory: ["simple-schema"],
        },
        load: async () => (await import("./tabular_view")).default,
    } satisfies DiagramAnalysisContribution,
];

export default {
    namespace: "std",
    name: "diagram-tabular-view",
    contributions,
} satisfies Plugin;
