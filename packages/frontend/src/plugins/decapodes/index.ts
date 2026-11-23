import type { Plugin, DiagramAnalysisContribution } from "../../plugin";

const contributions = [
    {
        name: "simulation",
        label: "Simulation",
        description: "Simulate the PDE using Decapodes",
        type: "diagram",
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
