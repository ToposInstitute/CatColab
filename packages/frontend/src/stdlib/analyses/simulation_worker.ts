import {
    type DblModel,
    DblModelMap,
    type DblTheory,
    elaborateModel,
    type ModelNotebook,
} from "catlog-wasm";
import { analysisDispatches, theoryClassCtors } from "./simulation_config";
import type {
    SerializedODESolution,
    SimulationRequest,
    SimulationResponse,
    WorkerReadyMessage,
} from "./simulation_worker_types";

const theoryClassCache = new Map<string, object>();

function getTheoryClass(theoryId: string): object {
    let instance = theoryClassCache.get(theoryId);
    if (!instance) {
        const ctor = theoryClassCtors[theoryId];
        if (!ctor) {
            throw new Error(`Unknown theory ID: ${theoryId}`);
        }
        instance = ctor();
        theoryClassCache.set(theoryId, instance);
    }
    return instance;
}

function getTheory(theoryId: string): DblTheory {
    const instance = getTheoryClass(theoryId);
    return (instance as { theory(): DblTheory }).theory();
}

let cachedElaboration: {
    theoryId: string;
    refId: string;
    notebookJson: string;
    model: DblModel;
} | null = null;

function elaborateWithCache(notebook: ModelNotebook, theoryId: string, refId: string): DblModel {
    const notebookJson = JSON.stringify(notebook);

    if (
        cachedElaboration &&
        cachedElaboration.theoryId === theoryId &&
        cachedElaboration.refId === refId &&
        cachedElaboration.notebookJson === notebookJson
    ) {
        return cachedElaboration.model;
    }

    const theory = getTheory(theoryId);
    const instantiated = new DblModelMap();
    const model = elaborateModel(notebook, instantiated, theory, refId);

    cachedElaboration = { theoryId, refId, notebookJson, model };
    return model;
}

function serializeODESolution(solution: {
    time: number[];
    states: Map<string, number[]>;
}): SerializedODESolution {
    const states: Record<string, number[]> = {};
    for (const [key, value] of solution.states) {
        states[key] = value;
    }
    return { time: solution.time, states };
}

function handleRequest(request: SimulationRequest): SimulationResponse {
    const { requestId, theoryId, analysisId, notebook, refId, params } = request;

    try {
        const classCtor = theoryClassCtors[theoryId];
        if (!classCtor) {
            return { requestId, tag: "Err", error: `Unknown theory: ${theoryId}` };
        }

        const dispatch = analysisDispatches[analysisId];
        if (!dispatch) {
            return {
                requestId,
                tag: "Err",
                error: `Unknown analysis: ${analysisId}`,
            };
        }

        const th = getTheoryClass(theoryId);
        const model = elaborateWithCache(notebook, theoryId, refId);
        const simResult = dispatch(th, model, params);

        if (simResult.hasEquations) {
            const { solution, latexEquations } = simResult.result;
            if (solution.tag === "Ok") {
                return {
                    requestId,
                    tag: "Ok",
                    hasEquations: true,
                    solution: serializeODESolution(solution.content),
                    latexEquations,
                };
            }
            return { requestId, tag: "Err", error: solution.content };
        }

        const result = simResult.result;
        if (result.tag === "Ok") {
            return {
                requestId,
                tag: "Ok",
                hasEquations: false,
                solution: serializeODESolution(result.content),
            };
        }
        return { requestId, tag: "Err", error: result.content };
    } catch (e) {
        return { requestId, tag: "Err", error: String(e) };
    }
}

// Signal that the worker module (including WASM) has finished loading.
// Messages posted to a module worker before `self.onmessage` is set are
// silently dropped, so the main thread must wait for this before sending work.
self.postMessage({ type: "ready" } satisfies WorkerReadyMessage);

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
    const response = handleRequest(event.data);
    self.postMessage(response);
};
