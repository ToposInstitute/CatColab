import type { DblModel, LotkaVolterraProblemData, ODEResult } from "catlog-wasm";

export type { LotkaVolterraProblemData };

export type LotkaVolterraSimulator = (model: DblModel, data: LotkaVolterraProblemData) => ODEResult;

export const newLotkaVolterraProblemData = (): LotkaVolterraProblemData => ({
    interactionCoefficients: {},
    growthRates: {},
    initialValues: {},
    duration: 10,
});
