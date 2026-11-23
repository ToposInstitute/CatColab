import type { ModelAnalysisContribution, Plugin } from "../../plugin";

const contributions = [
    {
        name: "simulation",
        label: "Stochastic mass-action dynamics",
        description: "Simulate a stochastic system using the law of mass action",
        help: "stochastic-mass-action",
        type: "model",
        scope: {
            theory: ["petri-net"],
        },
        load: async () => (await import("./mass_action_stochastic")).default,
    },
] satisfies ModelAnalysisContribution[];

export default {
    namespace: "std",
    name: "mass-action-stochastic",
    contributions,
} satisfies Plugin;
