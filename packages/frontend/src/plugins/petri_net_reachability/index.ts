import type { ModelAnalysisContribution, Plugin } from "../../plugin";

const contributions = [
    {
        type: "analysis",
        name: "subreachability",
        label: "Sub-reachability check",
        description: "Check that forbidden tokenings are unreachable",
        help: "subreachability",
        analysisType: "model",
        scope: {
            theory: ["petri-net"],
        },
        load: async () => (await import("./subreachability")).default,
    } satisfies ModelAnalysisContribution,
];

export default {
    namespace: "std",
    name: "petri-net-reachability",
    contributions,
} satisfies Plugin;
