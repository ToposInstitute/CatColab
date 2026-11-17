import type { LinearODEProblemData } from "catlog-wasm";

export type { LinearODEProblemData };

export const newLinearODEProblemData = (): LinearODEProblemData => ({
    coefficients: {},
    initialValues: {},
    duration: 10,
});
