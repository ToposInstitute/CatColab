import type { DblModel, KuramotoProblemData, ODEResult } from "catlog-wasm";

export type { KuramotoProblemData };

export type KuramotoSimulator = (model: DblModel, data: KuramotoProblemData) => ODEResult;

export const newKuramotoProblemData = (): KuramotoProblemData => ({
    order: "second",
    couplingCoefficients: {},
    dampingCoefficients: {},
    forcingParameters: {},
    initialPhases: {},
    initialFrequencies: {},
    duration: 10,
});
