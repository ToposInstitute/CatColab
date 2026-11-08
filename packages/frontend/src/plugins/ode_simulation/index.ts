import type { MorType } from "catlog-wasm";
import type { ModelAnalysisPlugin } from "../../plugin";
import {
    loadKuramotoAnalysis,
    loadLinearODEAnalysis,
    loadLotkaVolterraAnalysis,
    loadMassActionAnalysis,
    loadMassActionEquationsAnalysis,
    loadPolynomialODEAnalysis,
    loadPolynomialODEEquationsAnalysis,
} from "./builder";

const flowType: MorType = {
    tag: "Hom",
    content: { tag: "Basic", content: "Object" },
};

export const plugins = [
    {
        id: "linear-ode",
        name: "Linear ODE dynamics",
        description: "Simulate the system using a constant-coefficient linear first-order ODE",
        help: "linear-ode",
        type: "model",
        scope: {
            theory: ["causal-loop", "reg-net"],
        },
        load: loadLinearODEAnalysis({
            loadSimulator: async () => (await import("./bindings/signed_category")).linearODE,
        }),
    },
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
            loadSimulator: async () => (await import("./bindings/signed_category")).lotkaVolterra,
        }),
    },
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
    {
        id: "polynomial-ode-simulation",
        name: "Polynomial ODE simulation",
        description: "Simulate the system",
        help: "polynomial-ode-simulation",
        type: "model",
        scope: {
            theory: ["polynomial-ode"],
        },
        load: loadPolynomialODEAnalysis({
            loadSimulator: async () =>
                (await import("./bindings/polynomial_ode")).polynomialODESimulation,
            signedContributions: false,
        }),
    },
    {
        id: "polynomial-ode-equations",
        name: "Polynomial ODE equations",
        description: "Display the symbolic equations",
        help: "polynomial-ode-equations",
        type: "model",
        scope: {
            theory: ["polynomial-ode"],
        },
        load: loadPolynomialODEEquationsAnalysis({
            loadEquations: async () =>
                (await import("./bindings/polynomial_ode")).polynomialODEEquations,
        }),
    },
    {
        id: "signed-polynomial-ode-simulation",
        name: "Polynomial ODE simulation",
        description: "Simulate the system",
        help: "polynomial-ode-simulation",
        type: "model",
        scope: {
            theory: ["signed-polynomial-ode"],
        },
        load: loadPolynomialODEAnalysis({
            loadSimulator: async () =>
                (await import("./bindings/signed_polynomial_ode")).polynomialODESimulation,
            signedContributions: true,
        }),
    },
    {
        id: "signed-polynomial-ode-equations",
        name: "Polynomial ODE equations",
        description: "Display the symbolic equations",
        help: "polynomial-ode-equations",
        type: "model",
        scope: {
            theory: ["signed-polynomial-ode"],
        },
        load: loadPolynomialODEEquationsAnalysis({
            loadEquations: async () =>
                (await import("./bindings/signed_polynomial_ode")).polynomialODEEquations,
        }),
    },
    {
        id: "kuramoto",
        name: "Kuramoto dynamics",
        description: "Simulate the system using the Kuramoto dynamical model",
        help: "kuramoto",
        type: "model",
        scope: {
            theory: ["power-system"],
        },
        load: loadKuramotoAnalysis({
            loadSimulator: async () => (await import("./bindings/power_system")).kuramoto,
            couplingLabel: "Capacity",
            forcingLabel: "Input power",
        }),
    },
] satisfies ModelAnalysisPlugin[];
