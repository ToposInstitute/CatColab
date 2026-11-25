import type { ModelAnalysisContribution, Plugin } from "../../plugin";
import { loadPolynomialODEAnalysis, loadPolynomialODEEquationsAnalysis } from "./builder";

const contributions = [
    {
        type: "analysis",
        name: "polynomial-ode-simulation",
        label: "Polynomial ODE simulation",
        description: "Simulate the system",
        help: "polynomial-ode-simulation",
        analysisType: "model",
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
        type: "analysis",
        name: "polynomial-ode-equations",
        label: "Polynomial ODE equations",
        description: "Display the symbolic equations",
        help: "polynomial-ode-equations",
        analysisType: "model",
        scope: {
            theory: ["polynomial-ode"],
        },
        load: loadPolynomialODEEquationsAnalysis({
            loadEquations: async () =>
                (await import("./bindings/polynomial_ode")).polynomialODEEquations,
        }),
    },
    {
        type: "analysis",
        name: "signed-polynomial-ode-simulation",
        label: "Polynomial ODE simulation",
        description: "Simulate the system",
        help: "polynomial-ode-simulation",
        analysisType: "model",
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
        type: "analysis",
        name: "signed-polynomial-ode-equations",
        label: "Polynomial ODE equations",
        description: "Display the symbolic equations",
        help: "polynomial-ode-equations",
        analysisType: "model",
        scope: {
            theory: ["signed-polynomial-ode"],
        },
        load: loadPolynomialODEEquationsAnalysis({
            loadEquations: async () =>
                (await import("./bindings/signed_polynomial_ode")).polynomialODEEquations,
        }),
    },
] satisfies ModelAnalysisContribution[];

export default {
    namespace: "std",
    name: "polynomial-ode",
    contributions,
} satisfies Plugin;
