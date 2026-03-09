import type {
    DblModel,
    KuramotoProblemData,
    LinearODEProblemData,
    LotkaVolterraProblemData,
    MassActionProblemData,
    ODELatex,
} from "catlog-wasm";

export type {
    KuramotoProblemData,
    LinearODEProblemData,
    LotkaVolterraProblemData,
    MassActionProblemData,
};

export type MassActionEquations = (model: DblModel) => ODELatex;
export type UnbalancedMassActionEquations = (model: DblModel) => ODELatex;

/** Configuration for a Decapodes analysis of a diagram. */
export type DecapodesAnalysisContent = {
    domain: string | null;
    mesh: string | null;
    initialConditions: Record<string, string>;
    plotVariables: Record<string, boolean>;
    scalars: Record<string, number>;
    duration: number;
};
