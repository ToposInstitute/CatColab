import type { DblModel, ODEResult, ODEResultWithEquations } from "catlog-wasm";
import {
    ThCategoryLinks,
    ThCategorySignedLinks,
    ThPowerSystem,
    ThSignedCategory,
    ThSymMonoidalCategory,
} from "catlog-wasm";

/// This allows us to rebuild a subset of the theory library in the web worker without needing to
// serialize the stdTheories library

export type SimulationResult =
    | { hasEquations: false; result: ODEResult }
    | { hasEquations: true; result: ODEResultWithEquations };

// biome-ignore lint/suspicious/noExplicitAny: theory class types and params are dynamically typed
export type AnalysisDispatch = (th: any, model: DblModel, params: any) => SimulationResult;

/** Theory ID -> WASM class constructor. */
export const theoryClassCtors: Record<string, () => object> = {
    "petri-net": () => new ThSymMonoidalCategory(),
    "primitive-stock-flow": () => new ThCategoryLinks(),
    "primitive-signed-stock-flow": () => new ThCategorySignedLinks(),
    "reg-net": () => new ThSignedCategory(),
    "causal-loop": () => new ThSignedCategory(),
    "power-system": () => new ThPowerSystem(),
};

/** Analysis ID -> dispatch function. Independent of theory. */
export const analysisDispatches = {
    "mass-action": (th, model, params) => ({
        hasEquations: true,
        result: th.massAction(model, params),
    }),
    "stochastic-mass-action": (th, model, params) => ({
        hasEquations: false,
        result: th.stochasticMassAction(model, params),
    }),
    "linear-ode": (th, model, params) => ({
        hasEquations: false,
        result: th.linearODE(model, params),
    }),
    "lotka-volterra": (th, model, params) => ({
        hasEquations: false,
        result: th.lotkaVolterra(model, params),
    }),
    kuramoto: (th, model, params) => ({
        hasEquations: false,
        result: th.kuramoto(model, params),
    }),
} satisfies Record<string, AnalysisDispatch>;

/** Union type of all valid simulation analysis IDs. */
export type AnalysisId = keyof typeof analysisDispatches;
