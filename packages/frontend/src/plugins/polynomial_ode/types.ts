import type {
    DblModel,
    LatexEquations,
    ODEResultWithEquations,
    PolynomialODEEquationsData,
    PolynomialODEProblemData,
} from "catlog-wasm";

export type { PolynomialODEEquationsData, PolynomialODEProblemData };

export type PolynomialODESimulator = (
    model: DblModel,
    data: PolynomialODEProblemData,
) => ODEResultWithEquations;

export const newPolynomialODEProblemData = (): PolynomialODEProblemData => ({
    coefficients: {},
    initialValues: {},
    duration: 10,
});

export type PolynomialODEEquations = (
    model: DblModel,
    data: PolynomialODEEquationsData,
) => LatexEquations;

export const newPolynomialODEEquationsData = (): PolynomialODEEquationsData => ({
    trivialData: true,
});
