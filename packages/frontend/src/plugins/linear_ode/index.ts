import type { ModelAnalysisContribution, Plugin } from "../../plugin";

const contributions = [
    {
        name: "simulation",
        label: "Linear ODE dynamics",
        description: "Simulate the system using a constant-coefficient linear first-order ODE",
        help: "linear-ode",
        analysisType: "model",
        scope: {
            theory: ["causal-loop", "reg-net"],
        },
        load: async () => (await import("./linear_ode")).default,
    },
] satisfies ModelAnalysisContribution[];

export default {
    namespace: "std",
    name: "linear-ode",
    contributions,
} satisfies Plugin;
