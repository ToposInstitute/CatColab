import type {
    DblModel,
    LinearODEProblemData,
    LotkaVolterraProblemData,
    MassActionProblemData,
    ODEResult,
} from "catlog-wasm";

export type { LinearODEProblemData, LotkaVolterraProblemData, MassActionProblemData };

export type LinearODESimulator = (model: DblModel, data: LinearODEProblemData) => ODEResult;

export type LotkaVolterraSimulator = (model: DblModel, data: LotkaVolterraProblemData) => ODEResult;

export type MassActionSimulator = (model: DblModel, data: MassActionProblemData) => ODEResult;

/** Configuration for a Decapodes analysis of a diagram. */
export type DecapodesAnalysisContent = {
    domain: string | null;
    mesh: string | null;
    initialConditions: Record<string, string>;
    plotVariables: Record<string, boolean>;
    scalars: Record<string, number>;
    duration: number;
};
