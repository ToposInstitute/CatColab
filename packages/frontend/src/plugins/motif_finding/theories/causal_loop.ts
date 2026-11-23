import type { ModelAnalysisContribution } from "../../../plugin";
import { loadMotifFindingAnalysis } from "../builder";

export const contributions = [
    {
        name: "causal-loop-negative-loops",
        label: "Balancing loops",
        description: "Analyze the diagram for balancing loops",
        help: "loops",
        analysisType: "model",
        scope: {
            theory: ["causal-loop"],
        },
        load: loadMotifFindingAnalysis(
            async () => (await import("../bindings/signed_category")).negativeLoops,
        ),
    },
    {
        name: "causal-loop-positive-loops",
        label: "Reinforcing loops",
        description: "Analyze the diagram for reinforcing loops",
        help: "loops",
        analysisType: "model",
        scope: {
            theory: ["causal-loop"],
        },
        load: loadMotifFindingAnalysis(
            async () => (await import("../bindings/signed_category")).positiveLoops,
        ),
    },
] satisfies ModelAnalysisContribution[];
