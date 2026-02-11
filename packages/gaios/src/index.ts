import { actions } from "./actions";

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
        id: "catcolab-model-kaspar",
        name: "CatColab Kaspar",
        icon: "Zap",
        supportedDataTypes: ["catcolab-model"],
        async load() {
            const { renderModelTool } = await import("./model_tool");
            return renderModelTool;
        },
    },
    ...actions,
];
