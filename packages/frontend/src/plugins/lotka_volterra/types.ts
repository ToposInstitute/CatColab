import type { LotkaVolterraProblemData } from "catlog-wasm";

export type { LotkaVolterraProblemData };

export const newLotkaVolterraProblemData = (): LotkaVolterraProblemData => ({
    interactionCoefficients: {},
    growthRates: {},
    initialValues: {},
    duration: 10,
});
