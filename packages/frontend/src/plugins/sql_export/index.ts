import type { ModelAnalysisContribution, Plugin } from "../../plugin";

const contributions = [
    {
        type: "analysis",
        name: "schema-export",
        label: "SQL schema",
        description: "Produce SQL DML from this schema",
        help: "sql",
        analysisType: "model",
        scope: {
            theory: ["simple-schema"],
        },
        load: async () => (await import("./sql_export")).default,
    } satisfies ModelAnalysisContribution,
];

export default {
    namespace: "std",
    name: "sql-export",
    contributions,
} satisfies Plugin;
