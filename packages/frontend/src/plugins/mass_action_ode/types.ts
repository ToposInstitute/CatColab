import type {
    DblModel,
    LatexEquations,
    MassActionEquationsData,
    MassActionProblemData,
    ODEResultWithEquations,
} from "catlog-wasm";

export type { MassActionEquationsData, MassActionProblemData };

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
