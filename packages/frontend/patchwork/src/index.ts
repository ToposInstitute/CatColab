import { type Plugin } from "@patchwork/sdk";

console.log("This is index.ts in the solidjs-demo package");

import "./index.css";

export const plugins: Plugin<any>[] = [
    {
        type: "patchwork:dataType",
        id: "catcolab-model",
        name: "CatColab Model",
        icon: "Zap",
        async load() {
            console.log("Loading catcolab-model dataType...");
            try {
                const { dataType } = await import("./datatype");
                console.log("Successfully loaded dataType:", dataType);
                return dataType;
            } catch (error) {
                console.error("Failed to load dataType:", error);
                throw error;
            }
        },
    },
    {
        type: "patchwork:tool",
        id: "catcolab-model-editor",
        name: "CatColab Model Editor",
        icon: "Zap",
        supportedDataTypes: ["catcolab-model"],
        async load() {
            console.log("Loading catcolab-model-editor tool...");
            try {
                const Tool = (await import("./tool")).default;
                console.log("Successfully loaded Tool component:", Tool);
                console.log("Tool type:", typeof Tool);
                console.log("Tool name:", Tool?.name);
                return { EditorComponent: Tool };
            } catch (error) {
                console.error("Failed to load Tool component:", error);
                throw error;
            }
        },
    },
];
