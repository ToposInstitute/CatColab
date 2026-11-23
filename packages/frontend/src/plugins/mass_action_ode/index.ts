import type { MorType } from "catlog-wasm";
import type { ModelAnalysisContribution } from "../../plugin";
import { loadMassActionAnalysis, loadMassActionEquationsAnalysis } from "./builder";

const flowType: MorType = {
    tag: "Hom",
    content: { tag: "Basic", content: "Object" },
};

export const contributions = [
    {
        id: "petri-net-mass-action",
        name: "Mass-action dynamics",
        description: "Simulate the system using the law of mass action",
        help: "mass-action",
        type: "model",
        scope: {
            theory: ["petri-net"],
        },
        load: loadMassActionAnalysis({
            loadSimulator: async () =>
                (await import("./bindings/sym_monoidal_category")).massAction,
            ratesHaveGranularity: true,
        }),
    },
    {
        id: "petri-net-mass-action-equations",
        name: "Mass-action dynamics equations",
        description: "Display the symbolic mass-action dynamics equations",
        help: "mass-action-equations",
        type: "model",
        scope: {
            theory: ["petri-net"],
        },
        load: loadMassActionEquationsAnalysis({
            loadEquations: async () =>
                (await import("./bindings/sym_monoidal_category")).massActionEquations,
            ratesHaveGranularity: true,
        }),
    },
    {
        id: "primitive-stock-flow-mass-action",
        name: "Mass-action dynamics",
        description: "Simulate the system using the law of mass action",
        help: "mass-action",
        type: "model",
        scope: {
            theory: ["primitive-stock-flow"],
        },
        load: loadMassActionAnalysis({
            loadSimulator: async () => (await import("./bindings/category_links")).massAction,
            ratesHaveGranularity: false,
            transitionType: flowType,
        }),
    },
    {
        id: "primitive-stock-flow-mass-action-equations",
        name: "Mass-action dynamics equations",
        description: "Display the symbolic mass-action dynamics equations",
        help: "mass-action-equations",
        type: "model",
        scope: {
            theory: ["primitive-stock-flow"],
        },
        load: loadMassActionEquationsAnalysis({
            loadEquations: async () =>
                (await import("./bindings/category_links")).massActionEquations,
            ratesHaveGranularity: false,
        }),
    },
    {
        id: "primitive-signed-stock-flow-mass-action",
        name: "Mass-action dynamics",
        description: "Simulate the system using the law of mass action",
        help: "mass-action",
        type: "model",
        scope: {
            theory: ["primitive-signed-stock-flow"],
        },
        load: loadMassActionAnalysis({
            loadSimulator: async () =>
                (await import("./bindings/category_signed_links")).massAction,
            ratesHaveGranularity: false,
            transitionType: flowType,
        }),
    },
    {
        id: "primitive-signed-stock-flow-mass-action-equations",
        name: "Mass-action dynamics equations",
        description: "Display the symbolic mass-action dynamics equations",
        help: "mass-action-equations",
        type: "model",
        scope: {
            theory: ["primitive-signed-stock-flow"],
        },
        load: loadMassActionEquationsAnalysis({
            loadEquations: async () =>
                (await import("./bindings/category_signed_links")).massActionEquations,
            ratesHaveGranularity: false,
        }),
    },
] satisfies ModelAnalysisContribution[];
