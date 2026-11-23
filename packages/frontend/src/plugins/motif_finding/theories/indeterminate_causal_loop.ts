import type { ModelAnalysisContribution } from "../../../plugin";
import { loadMotifFindingAnalysis } from "../builder";

export const contributions = [
    {
        type: "analysis",
        name: "indeterminate-causal-loop-negative-loops",
        label: "Balancing loops",
        description: "Analyze the diagram for balancing loops",
        help: "loops",
        analysisType: "model",
        scope: {
            theory: ["indeterminate-causal-loop"],
        },
        load: loadMotifFindingAnalysis(
            async () => (await import("../bindings/nullable_signed_category")).negativeLoops,
        ),
    },
    {
        type: "analysis",
        name: "indeterminate-causal-loop-positive-loops",
        label: "Reinforcing loops",
        description: "Analyze the diagram for reinforcing loops",
        help: "loops",
        analysisType: "model",
        scope: {
            theory: ["indeterminate-causal-loop"],
        },
        load: loadMotifFindingAnalysis(
            async () => (await import("../bindings/nullable_signed_category")).positiveLoops,
        ),
    },
    {
        type: "analysis",
        name: "indeterminate-causal-loop-indeterminate-loops",
        label: "Indeterminate loops",
        description: "Analyze the diagram for indeterminate loops",
        help: "loops",
        analysisType: "model",
        scope: {
            theory: ["indeterminate-causal-loop"],
        },
        load: loadMotifFindingAnalysis(
            async () => (await import("../bindings/nullable_signed_category")).indeterminateLoops,
        ),
    },
] satisfies ModelAnalysisContribution[];
