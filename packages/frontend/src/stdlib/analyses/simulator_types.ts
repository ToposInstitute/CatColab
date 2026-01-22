import type {
    DblModel,
    KuramotoProblemData,
    LinearODEProblemData,
    LotkaVolterraProblemData,
    MassActionProblemData,
    ODELatex,
    ODEResult,
    ODEResultWithEquations,
} from "catlog-wasm";

export type {
    KuramotoProblemData,
    LinearODEProblemData,
    LotkaVolterraProblemData,
    MassActionProblemData,
};

export type KuramotoSimulator = (model: DblModel, data: KuramotoProblemData) => ODEResult;
export type LinearODESimulator = (model: DblModel, data: LinearODEProblemData) => ODEResult;
export type LotkaVolterraSimulator = (model: DblModel, data: LotkaVolterraProblemData) => ODEResult;
export type MassActionSimulator = (
    model: DblModel,
    data: MassActionProblemData,
) => ODEResultWithEquations;
export type StochasticMassActionSimulator = (
    model: DblModel,
    data: MassActionProblemData,
) => ODEResult;
export type MassActionEquations = (model: DblModel) => ODELatex;

/** Configuration for a Decapodes analysis of a diagram. */
export type DecapodesAnalysisContent = {
    domain: string | null;
    mesh: string | null;
    initialConditions: Record<string, string>;
    plotVariables: Record<string, boolean>;
    scalars: Record<string, number>;
    duration: number;
};
