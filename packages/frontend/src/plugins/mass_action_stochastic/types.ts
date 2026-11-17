import type { StochasticMassActionProblemData } from "catlog-wasm";

export type { StochasticMassActionProblemData };

export const newStochasticMassActionProblemData = (): StochasticMassActionProblemData => ({
    rates: {},
    initialValues: {},
    seed: null,
    duration: 10,
});
