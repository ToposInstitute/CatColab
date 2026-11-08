import type {
    DblModel,
    KuramotoProblemData,
    LatexEquations,
    LinearODEProblemData,
    LotkaVolterraProblemData,
    MassActionEquationsData,
    MassActionProblemData,
    ODEResult,
    ODEResultWithEquations,
    PolynomialODEEquationsData,
    PolynomialODEProblemData,
} from "catlog-wasm";

export type {
    KuramotoProblemData,
    LinearODEProblemData,
    LotkaVolterraProblemData,
    MassActionEquationsData,
    MassActionProblemData,
    PolynomialODEEquationsData,
    PolynomialODEProblemData,
};

export type KuramotoSimulator = (model: DblModel, data: KuramotoProblemData) => ODEResult;

export const newKuramotoProblemData = (): KuramotoProblemData => ({
    order: "second",
    couplingCoefficients: {},
    dampingCoefficients: {},
    forcingParameters: {},
    initialPhases: {},
    initialFrequencies: {},
    duration: 10,
});

export type LinearODESimulator = (model: DblModel, data: LinearODEProblemData) => ODEResult;

export const newLinearODEProblemData = (): LinearODEProblemData => ({
    coefficients: {},
    initialValues: {},
    duration: 10,
});

export type LotkaVolterraSimulator = (model: DblModel, data: LotkaVolterraProblemData) => ODEResult;

export const newLotkaVolterraProblemData = (): LotkaVolterraProblemData => ({
    interactionCoefficients: {},
    growthRates: {},
    initialValues: {},
    duration: 10,
});

export type MassActionSimulator = (
    model: DblModel,
    data: MassActionProblemData,
) => ODEResultWithEquations;

export const newMassActionProblemData = (): MassActionProblemData => ({
    massConservationType: { type: "Balanced" },
    rates: {},
    transitionProductionRates: {},
    transitionConsumptionRates: {},
    placeProductionRates: {},
    placeConsumptionRates: {},
    initialValues: {},
    duration: 10,
});

export type MassActionEquations = (
    model: DblModel,
    data: MassActionEquationsData,
) => LatexEquations;

export const newMassActionEquationsData = (): MassActionEquationsData => ({
    massConservationType: { type: "Balanced" },
});

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
