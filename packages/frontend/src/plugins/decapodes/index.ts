import type { Plugin, DiagramAnalysisContribution } from "../../plugin";

const contributions = [
    {
        type: "analysis",
        name: "simulation",
        label: "Simulation",
        description: "Simulate the PDE using Decapodes",
        analysisType: "diagram",
        scope: {
            theory: ["unary-dec"],
        },
        load: async () => (await import("./decapodes")).default,
    } satisfies DiagramAnalysisContribution,
];

export default {
    namespace: "std",
    name: "decapodes",
    contributions,
} satisfies Plugin;
