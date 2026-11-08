import type { ModelAnalysisPlugin } from "../../../plugin";
import { loadMotifFindingAnalysis } from "../builder";

export const plugins = [
    {
        id: "reg-net-positive-loops",
        name: "Positive feedback",
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
        id: "reg-net-negative-loops",
        name: "Negative feedback",
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
] satisfies ModelAnalysisPlugin[];
