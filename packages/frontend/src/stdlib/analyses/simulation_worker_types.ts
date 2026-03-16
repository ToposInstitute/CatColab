import type { LatexEquation, ModelNotebook } from "catlog-wasm";
import type { AnalysisId } from "./simulation_config";

/** Request sent from the main thread to the simulation worker. */
export type SimulationRequest = {
    requestId: number;
    theoryId: string;
    analysisId: AnalysisId;
    notebook: ModelNotebook;
    refId: string;
    params: unknown;
};

/** Serializable ODE solution data (uses plain object instead of Map). */
export type SerializedODESolution = {
    time: number[];
    states: Record<string, number[]>;
};

/** Response sent from the simulation worker to the main thread. */
export type SimulationResponse = {
    requestId: number;
} & (
    | {
          tag: "Ok";
          hasEquations: false;
          solution: SerializedODESolution;
      }
    | {
          tag: "Ok";
          hasEquations: true;
          solution: SerializedODESolution;
          latexEquations: LatexEquation[];
      }
    | { tag: "Err"; error: string }
);

/** Message sent by the worker after its module (including WASM) has loaded.
 *
 * Module workers with top-level WASM imports drop messages posted before the
 * module finishes evaluating. The main thread must wait for this signal before
 * sending any requests.
 */
export type WorkerReadyMessage = { type: "ready" };
