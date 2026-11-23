import type { ModelAnalysisContribution } from "../../../plugin";
import { loadMotifFindingAnalysis } from "../builder";

export const contributions = [
    {
        name: "reg-net-positive-loops",
        label: "Positive feedback",
        description: "Analyze the network for positive feedback loops",
        help: "loops",
        type: "model",
        scope: {
            theory: ["reg-net"],
        },
        load: loadMotifFindingAnalysis(
            async () => (await import("../bindings/signed_category")).positiveLoops,
        ),
    },
    {
        name: "reg-net-negative-loops",
        label: "Negative feedback",
        description: "Analyze the network for negative feedback loops",
        help: "loops",
        type: "model",
        scope: {
            theory: ["reg-net"],
        },
        load: loadMotifFindingAnalysis(
            async () => (await import("../bindings/signed_category")).negativeLoops,
        ),
    },
] satisfies ModelAnalysisContribution[];
