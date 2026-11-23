import type { ModelAnalysisContribution } from "../../plugin";

export const contributions = [
    {
        id: "stochastic-mass-action",
        name: "Stochastic mass-action dynamics",
        description: "Simulate a stochastic system using the law of mass action",
        help: "stochastic-mass-action",
        type: "model",
        scope: {
            theory: ["petri-net"],
        },
        load: async () => (await import("./mass_action_stochastic")).default,
    },
] satisfies ModelAnalysisContribution[];
