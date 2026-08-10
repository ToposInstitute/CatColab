export const plugins = [
    {
        type: "patchwork:datatype",
        id: "catcolab-model",
        name: "CatColab Model",
        icon: "Zap",
        async load() {
            const { dataType } = await import("./model_datatype");
            return dataType;
        },
    },
    {
        type: "patchwork:tool",
        id: "catcolab-model",
        name: "CatColab",
        icon: "Zap",
        supportedDatatypes: ["catcolab-model"],
        async load() {
            const { renderModelTool } = await import("./model_tool");
            return renderModelTool;
        },
    },
    {
        type: "patchwork:datatype",
        id: "catcolab-analysis",
        name: "CatColab Analysis",
        icon: "ChartSpline",
        // A blank analysis references no model, so hide it from the "new
        // document" menu; analyses are created from the model tool instead.
        unlisted: true,
        async load() {
            const { dataType } = await import("./analysis_datatype");
            return dataType;
        },
    },
    {
        type: "patchwork:tool",
        id: "catcolab-analysis",
        name: "CatColab Analysis",
        icon: "ChartSpline",
        supportedDatatypes: ["catcolab-analysis"],
        async load() {
            const { renderAnalysisTool } = await import("./analysis_tool");
            return renderAnalysisTool;
        },
    },
];
