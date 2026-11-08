import type { ModelAnalysisPlugin } from "../../../plugin";
import { loadMotifFindingAnalysis } from "../builder";

export const plugins = [
    {
        id: "indeterminate-causal-loop-negative-loops",
        name: "Balancing loops",
        description: "Analyze the diagram for balancing loops",
        help: "loops",
        type: "model",
        scope: {
            theory: ["indeterminate-causal-loop"],
        },
        load: loadMotifFindingAnalysis(
            async () => (await import("../bindings/nullable_signed_category")).negativeLoops,
        ),
    },
    {
        id: "indeterminate-causal-loop-positive-loops",
        name: "Reinforcing loops",
        description: "Analyze the diagram for reinforcing loops",
        help: "loops",
        type: "model",
        scope: {
            theory: ["indeterminate-causal-loop"],
        },
        load: loadMotifFindingAnalysis(
            async () => (await import("../bindings/nullable_signed_category")).positiveLoops,
        ),
    },
    {
        id: "indeterminate-causal-loop-indeterminate-loops",
        name: "Indeterminate loops",
        description: "Analyze the diagram for indeterminate loops",
        help: "loops",
        type: "model",
        scope: {
            theory: ["indeterminate-causal-loop"],
        },
        load: loadMotifFindingAnalysis(
            async () => (await import("../bindings/nullable_signed_category")).indeterminateLoops,
        ),
    },
] satisfies ModelAnalysisPlugin[];
