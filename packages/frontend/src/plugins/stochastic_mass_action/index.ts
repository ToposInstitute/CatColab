import type { ModelAnalysisPlugin } from "../../plugin";

export const plugins = [
    {
        id: "stochastic-mass-action",
        name: "Stochastic mass-action dynamics",
        description: "Simulate a stochastic system using the law of mass action",
        help: "stochastic-mass-action",
        type: "model",
        scope: {
            theory: ["petri-net"],
        },
        load: async () => (await import("./stochastic_mass_action")).default,
    },
] satisfies ModelAnalysisPlugin[];
