import type { ModelAnalysisPlugin } from "../../plugin";

export const plugins = [
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
    } satisfies ModelAnalysisPlugin,
];
