import type { ModelAnalysisPlugin } from "../../plugin";
import { loadPolynomialODEAnalysis, loadPolynomialODEEquationsAnalysis } from "./builder";

export const plugins = [
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
] satisfies ModelAnalysisPlugin[];
