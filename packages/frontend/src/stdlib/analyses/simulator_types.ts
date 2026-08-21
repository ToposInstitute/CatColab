import type {
    DblModel,
    KuramotoProblemData,
    LatexEquations,
    LotkaVolterraProblemData,
    LinearODEProblemData,
    MassActionProblemData,
    ODEResult,
    ODEResultWithEquations,
    PolynomialODEProblemData,
    StochasticMassActionProblemData,
} from "catlog-wasm";

export type {
    KuramotoProblemData,
    LotkaVolterraProblemData,
    LinearODEProblemData,
    MassActionProblemData,
    PolynomialODEProblemData,
    StochasticMassActionProblemData,
};

export type KuramotoSimulator = (model: DblModel, data: KuramotoProblemData) => ODEResult;
export type LinearODESimulator = (
    model: DblModel,
    data: LinearODEProblemData,
) => ODEResultWithEquations;
export type LinearODEEquations = (model: DblModel) => LatexEquations;
export type LotkaVolterraSimulator = (
    model: DblModel,
    data: LotkaVolterraProblemData,
) => ODEResultWithEquations;
export type LotkaVolterraEquations = (model: DblModel) => LatexEquations;
export type MassActionSimulator = (
    model: DblModel,
    data: MassActionProblemData,
) => ODEResultWithEquations;
export type MassActionEquations = (
    model: DblModel,
    variant: MassActionProblemData,
) => LatexEquations;
export type StochasticMassActionSimulator = (
    model: DblModel,
    data: StochasticMassActionProblemData,
) => ODEResult;
export type PolynomialODESimulator = (
    model: DblModel,
    data: PolynomialODEProblemData,
) => ODEResultWithEquations;
export type PolynomialODEEquations = (model: DblModel) => LatexEquations;

/** Configuration for a Decapodes analysis of a diagram. */
export type DecapodesAnalysisContent = {
    domain: string | null;
    mesh: string | null;
    initialConditions: Record<string, string>;
    plotVariables: Record<string, boolean>;
    scalars: Record<string, number>;
    duration: number;
};
