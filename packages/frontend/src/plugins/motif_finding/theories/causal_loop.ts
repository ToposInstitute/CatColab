import type { ModelAnalysisPlugin } from "../../../plugin";
import { loadMotifFindingAnalysis } from "../builder";

export const plugins = [
    {
        id: "causal-loop-negative-loops",
        name: "Balancing loops",
        description: "Analyze the diagram for balancing loops",
        help: "loops",
        type: "model",
        scope: {
            theory: ["causal-loop"],
        },
        load: loadMotifFindingAnalysis(
            async () => (await import("../bindings/signed_category")).negativeLoops,
        ),
    },
    {
        id: "causal-loop-positive-loops",
        name: "Reinforcing loops",
        description: "Analyze the diagram for reinforcing loops",
        help: "loops",
        type: "model",
        scope: {
            theory: ["causal-loop"],
        },
        load: loadMotifFindingAnalysis(
            async () => (await import("../bindings/signed_category")).positiveLoops,
        ),
    },
] satisfies ModelAnalysisPlugin[];
