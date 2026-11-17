import type { ModelAnalysisPlugin } from "../../plugin";
import { loadKuramotoAnalysis } from "./builder";

export const plugins = [
    {
        id: "kuramoto",
        name: "Kuramoto dynamics",
        description: "Simulate the system using the Kuramoto dynamical model",
        help: "kuramoto",
        type: "model",
        scope: {
            theory: ["power-system"],
        },
        load: loadKuramotoAnalysis({
            loadSimulator: async () => (await import("./bindings")).kuramoto,
            couplingLabel: "Capacity",
            forcingLabel: "Input power",
        }),
    },
] satisfies ModelAnalysisPlugin[];
