import type { MorType } from "catlog-wasm";
import type { ModelAnalysisContribution, Plugin } from "../../plugin";
import { loadMassActionAnalysis, loadMassActionEquationsAnalysis } from "./builder";

const flowType: MorType = {
    tag: "Hom",
    content: { tag: "Basic", content: "Object" },
};

const contributions = [
    {
        name: "petri-net-simulation",
        label: "Mass-action dynamics",
        description: "Simulate the system using the law of mass action",
        help: "mass-action",
        analysisType: "model",
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
        name: "petri-net-equations",
        label: "Mass-action dynamics equations",
        description: "Display the symbolic mass-action dynamics equations",
        help: "mass-action-equations",
        analysisType: "model",
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
        name: "primitive-stock-flow-simulation",
        label: "Mass-action dynamics",
        description: "Simulate the system using the law of mass action",
        help: "mass-action",
        analysisType: "model",
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
        name: "primitive-stock-flow-equations",
        label: "Mass-action dynamics equations",
        description: "Display the symbolic mass-action dynamics equations",
        help: "mass-action-equations",
        analysisType: "model",
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
        name: "primitive-signed-stock-flow-simulation",
        label: "Mass-action dynamics",
        description: "Simulate the system using the law of mass action",
        help: "mass-action",
        analysisType: "model",
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
        name: "primitive-signed-stock-flow-equations",
        label: "Mass-action dynamics equations",
        description: "Display the symbolic mass-action dynamics equations",
        help: "mass-action-equations",
        analysisType: "model",
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

export default {
    namespace: "std",
    name: "mass-action-ode",
    contributions,
} satisfies Plugin;
