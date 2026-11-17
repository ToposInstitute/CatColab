import type { ModelAnalysisPlugin } from "../../plugin";

export const plugins = [
    {
        id: "sql-schema-export",
        name: "SQL schema",
        description: "Produce SQL DML from this schema",
        help: "sql",
        type: "model",
        scope: {
            theory: ["simple-schema"],
        },
        load: async () => (await import("./sql_export")).default,
    } satisfies ModelAnalysisPlugin,
];
