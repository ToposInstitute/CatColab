import type { ModelAnalysisContribution } from "../../plugin";

export const contributions = [
    {
        id: "schema-erd",
        name: "Entity-relationship diagram",
        description: "Visualize the schema as an entity-relationship diagram",
        help: "schema-erd",
        type: "model",
        scope: {
            theory: ["simple-schema"],
        },
        load: async () => (await import("./erd_visualization")).default,
    } satisfies ModelAnalysisContribution,
];
