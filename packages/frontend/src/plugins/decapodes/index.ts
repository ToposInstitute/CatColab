import type { DiagramAnalysisContribution } from "../../plugin";

export const contributions = [
    {
        id: "decapodes",
        name: "Simulation",
        description: "Simulate the PDE using Decapodes",
        type: "diagram",
        scope: {
            theory: ["unary-dec"],
        },
        load: async () => (await import("./decapodes")).default,
    } satisfies DiagramAnalysisContribution,
];
