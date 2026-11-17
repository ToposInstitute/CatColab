import type { ModelAnalysisPlugin } from "../../plugin";
import { loadLotkaVolterraAnalysis } from "./builder";

export const plugins = [
    {
        id: "lotka-volterra",
        name: "Lotka-Volterra dynamics",
        description: "Simulate the system using a Lotka-Volterra ODE",
        help: "lotka-volterra",
        type: "model",
        scope: {
            theory: ["causal-loop", "reg-net"],
        },
        load: loadLotkaVolterraAnalysis({
            loadSimulator: async () => (await import("./bindings")).lotkaVolterra,
        }),
    },
] satisfies ModelAnalysisPlugin[];
