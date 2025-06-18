import { type Plugin } from "@patchwork/sdk";

import "./index.css";

export const plugins: Plugin<any>[] = [
  {
    type: "patchwork:dataType",
    id: "solidjs-demo",
    name: "SolidJS Demo",
    icon: "Zap",
    async load() {
      const { dataType } = await import("./datatype");
      return dataType;
    },
  },
  {
    type: "patchwork:tool",
    id: "solidjs-demo",
    name: "SolidJS Demo",
    icon: "Zap",
    supportedDataTypes: ["solidjs-demo"],
    async load() {
      const { Tool } = await import("./tool");
      return { EditorComponent: Tool };
    },
  },
];
