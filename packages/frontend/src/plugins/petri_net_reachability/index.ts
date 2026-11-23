import type { ModelAnalysisContribution } from "../../plugin";

export const contributions = [
    {
        id: "subreachability",
        name: "Sub-reachability check",
        description: "Check that forbidden tokenings are unreachable",
        help: "subreachability",
        type: "model",
        scope: {
            theory: ["petri-net"],
        },
        load: async () => (await import("./subreachability")).default,
    } satisfies ModelAnalysisContribution,
];
