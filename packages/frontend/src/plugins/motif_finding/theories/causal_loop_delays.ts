import type { ModelAnalysisPlugin } from "../../../plugin";
import { loadMotifFindingAnalysis } from "../builder";

export const plugins = [
    {
        id: "causal-loop-delays-negative-loops",
        name: "Balancing loops",
        description: "Find the fast-acting balancing loops",
        help: "loops",
        type: "model",
        scope: {
            theory: ["causal-loop-delays"],
        },
        load: loadMotifFindingAnalysis(
            async () => (await import("../bindings/delayable_signed_category")).negativeLoops,
        ),
    },
    {
        id: "causal-loop-delays-positive-loops",
        name: "Reinforcing loops",
        description: "Find the fast-acting reinforcing loops",
        help: "loops",
        type: "model",
        scope: {
            theory: ["causal-loop-delays"],
        },
        load: loadMotifFindingAnalysis(
            async () => (await import("../bindings/delayable_signed_category")).positiveLoops,
        ),
    },
    {
        id: "causal-loop-delays-delayed-negative-loops",
        name: "Delayed balancing loops",
        description: "Find the slow-acting balancing loops",
        help: "loops",
        type: "model",
        scope: {
            theory: ["causal-loop-delays"],
        },
        load: loadMotifFindingAnalysis(
            async () =>
                (await import("../bindings/delayable_signed_category")).delayedNegativeLoops,
        ),
    },
    {
        id: "causal-loop-delays-delayed-positive-loops",
        name: "Delayed reinforcing loops",
        description: "Find the slow-acting reinforcing loops",
        help: "loops",
        type: "model",
        scope: {
            theory: ["causal-loop-delays"],
        },
        load: loadMotifFindingAnalysis(
            async () =>
                (await import("../bindings/delayable_signed_category")).delayedPositiveLoops,
        ),
    },
] satisfies ModelAnalysisPlugin[];
