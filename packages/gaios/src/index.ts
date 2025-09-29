export const plugins = [
    {
        type: "patchwork:dataType",
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
        supportedDataTypes: ["catcolab-model"],
        async load() {
            const { renderModelTool } = await import("./model_tool");
            return {
                render: renderModelTool,
            };
        },
    },
];
