import type { ModelAnalysisPlugin } from "../../plugin";

export const plugins = [
    {
        id: "linear-ode",
        name: "Linear ODE dynamics",
        description: "Simulate the system using a constant-coefficient linear first-order ODE",
        help: "linear-ode",
        type: "model",
        scope: {
            theory: ["causal-loop", "reg-net"],
        },
        load: async () => (await import("./linear_ode")).default,
    },
] satisfies ModelAnalysisPlugin[];
