import type { ModelAnalysisContribution, Plugin } from "../../plugin";

const contributions = [
    {
        name: "schema",
        label: "Entity-relationship diagram",
        description: "Visualize the schema as an entity-relationship diagram",
        help: "schema-erd",
        type: "model",
        scope: {
            theory: ["simple-schema"],
        },
        load: async () => (await import("./erd_visualization")).default,
    } satisfies ModelAnalysisContribution,
];

export default {
    namespace: "std",
    name: "erd-visualization",
    contributions,
} satisfies Plugin;
