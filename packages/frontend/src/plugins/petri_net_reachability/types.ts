import type { ReachabilityProblemData } from "catlog-wasm";

export type { ReachabilityProblemData };

export const newReachabilityProblemData = (): ReachabilityProblemData => ({
    tokens: {},
    forbidden: {},
});
