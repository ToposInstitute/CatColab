import type { ModelAnalysisContribution, Plugin } from "../../plugin";
import { loadKuramotoAnalysis } from "./builder";

const contributions = [
    {
        name: "simulation",
        label: "Kuramoto dynamics",
        description: "Simulate the system using the Kuramoto dynamical model",
        help: "kuramoto",
        analysisType: "model",
        scope: {
            theory: ["power-system"],
        },
        load: loadKuramotoAnalysis({
            loadSimulator: async () => (await import("./bindings")).kuramoto,
            couplingLabel: "Capacity",
            forcingLabel: "Input power",
        }),
    },
] satisfies ModelAnalysisContribution[];

export default {
    namespace: "std",
    name: "kuramoto",
    contributions,
} satisfies Plugin;
