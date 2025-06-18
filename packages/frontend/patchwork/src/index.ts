import { type Plugin } from "@patchwork/sdk";

import "./index.css";

export const plugins: Plugin<any>[] = [
    {
        type: "patchwork:dataType",
        id: "catcolab-model",
        name: "CatColab Model",
        icon: "Zap",
        async load() {
            const { dataType } = await import("./datatype");
            return dataType;
        },
    },
    {
        type: "patchwork:tool",
        id: "catcolab-model",
        name: "CatColab Model",
        icon: "Zap",
        supportedDataTypes: ["catcolab-model"],
        async load() {
            const { Tool } = await import("./tool");
            return { EditorComponent: Tool };
        },
    },
];
