import type { ModelAnalysisContribution, Plugin } from "../../plugin";

const contributions = [
    {
        name: "simulation",
        label: "Lotka-Volterra dynamics",
        description: "Simulate the system using a Lotka-Volterra ODE",
        help: "lotka-volterra",
        type: "model",
        scope: {
            theory: ["causal-loop", "reg-net"],
        },
        load: async () => (await import("./lotka_volterra")).default,
    },
] satisfies ModelAnalysisContribution[];

export default {
    namespace: "std",
    name: "lotka-volterra",
    contributions,
} satisfies Plugin;
