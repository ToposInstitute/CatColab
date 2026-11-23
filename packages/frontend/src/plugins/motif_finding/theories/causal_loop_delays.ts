import type { ModelAnalysisContribution } from "../../../plugin";
import { loadMotifFindingAnalysis } from "../builder";

export const contributions = [
    {
        type: "analysis",
        name: "causal-loop-delays-negative-loops",
        label: "Balancing loops",
        description: "Find the fast-acting balancing loops",
        help: "loops",
        analysisType: "model",
        scope: {
            theory: ["causal-loop-delays"],
        },
        load: loadMotifFindingAnalysis(
            async () => (await import("../bindings/delayable_signed_category")).negativeLoops,
        ),
    },
    {
        type: "analysis",
        name: "causal-loop-delays-positive-loops",
        label: "Reinforcing loops",
        description: "Find the fast-acting reinforcing loops",
        help: "loops",
        analysisType: "model",
        scope: {
            theory: ["causal-loop-delays"],
        },
        load: loadMotifFindingAnalysis(
            async () => (await import("../bindings/delayable_signed_category")).positiveLoops,
        ),
    },
    {
        type: "analysis",
        name: "causal-loop-delays-delayed-negative-loops",
        label: "Delayed balancing loops",
        description: "Find the slow-acting balancing loops",
        help: "loops",
        analysisType: "model",
        scope: {
            theory: ["causal-loop-delays"],
        },
        load: loadMotifFindingAnalysis(
            async () =>
                (await import("../bindings/delayable_signed_category")).delayedNegativeLoops,
        ),
    },
    {
        type: "analysis",
        name: "causal-loop-delays-delayed-positive-loops",
        label: "Delayed reinforcing loops",
        description: "Find the slow-acting reinforcing loops",
        help: "loops",
        analysisType: "model",
        scope: {
            theory: ["causal-loop-delays"],
        },
        load: loadMotifFindingAnalysis(
            async () =>
                (await import("../bindings/delayable_signed_category")).delayedPositiveLoops,
        ),
    },
] satisfies ModelAnalysisContribution[];
