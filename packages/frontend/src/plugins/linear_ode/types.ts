import type { DblModel, LinearODEProblemData, ODEResult } from "catlog-wasm";

export type { LinearODEProblemData };

export type LinearODESimulator = (model: DblModel, data: LinearODEProblemData) => ODEResult;

export const newLinearODEProblemData = (): LinearODEProblemData => ({
    coefficients: {},
    initialValues: {},
    duration: 10,
});
