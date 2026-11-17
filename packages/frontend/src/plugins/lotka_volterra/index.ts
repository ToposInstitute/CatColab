import type { ModelAnalysisPlugin } from "../../plugin";

export const plugins = [
    {
        id: "lotka-volterra",
        name: "Lotka-Volterra dynamics",
        description: "Simulate the system using a Lotka-Volterra ODE",
        help: "lotka-volterra",
        type: "model",
        scope: {
            theory: ["causal-loop", "reg-net"],
        },
        load: async () => (await import("./lotka_volterra")).default,
    },
] satisfies ModelAnalysisPlugin[];
