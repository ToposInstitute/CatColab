import { type Accessor, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { unwrap } from "solid-js/store";

import type { DblModel, JsResult, LatexEquation, ODELatex } from "catlog-wasm";
import type { LiveModelDoc, ValidatedModel } from "../../model";
import type { ODEPlotData, StateVarData } from "../../visualization";
import type {
    SerializedODESolution,
    SimulationRequest,
    SimulationResponse,
    WorkerReadyMessage,
} from "./simulation_worker_types";

/** Result of simulating an ODE with equations, containing both plot data and LaTeX equations. */
export type ODEPlotDataWithEquations = {
    plotData: JsResult<ODEPlotData, string>;
    latexEquations: LatexEquation[];
};

/** Return type of the worker-based ODE plot functions. */
export type ODEPlotResult = {
    data: Accessor<JsResult<ODEPlotData, string> | undefined>;
    loading: Accessor<boolean>;
};

/** Return type of the worker-based ODE plot functions with equations. */
export type ODEPlotResultWithEquations = {
    data: Accessor<ODEPlotDataWithEquations | undefined>;
    loading: Accessor<boolean>;
};

let workerInstance: Worker | null = null;
let workerReady = false;
let pendingQueue: SimulationRequest[] = [];
const pendingCallbacks = new Map<number, (response: SimulationResponse) => void>();
let requestIdCounter = 0;

function getWorker(): Worker {
    if (workerInstance) {
        return workerInstance;
    }

    workerReady = false;
    pendingQueue = [];
    workerInstance = new Worker(new URL("./simulation_worker.ts", import.meta.url), {
        type: "module",
    });

    workerInstance.onmessage = (event: MessageEvent<SimulationResponse | WorkerReadyMessage>) => {
        const data = event.data;

        if ("type" in data && data.type === "ready") {
            for (const req of pendingQueue) {
                // TODO: how to handle failure? This fails silently
                workerInstance?.postMessage(req);
            }
            pendingQueue = [];

            workerReady = true;
            return;
        }

        const response = data as SimulationResponse;
        const callback = pendingCallbacks.get(response.requestId);
        if (callback) {
            pendingCallbacks.delete(response.requestId);
            callback(response);
        }
    };

    workerInstance.onerror = (event) => {
        const error = event.message || "Worker error";
        for (const [id, callback] of pendingCallbacks) {
            callback({ requestId: id, tag: "Err", error });
        }
        pendingCallbacks.clear();
        workerInstance = null;
        workerReady = false;
        pendingQueue = [];
    };

    return workerInstance;
}

function postToWorker(request: SimulationRequest): Promise<SimulationResponse> {
    return new Promise((resolve) => {
        pendingCallbacks.set(request.requestId, resolve);
        const worker = getWorker();
        if (workerReady) {
            worker.postMessage(request);
        } else {
            pendingQueue.push(request);
        }
    });
}

function serializedSolutionToPlotData(
    model: DblModel,
    solution: SerializedODESolution,
): ODEPlotData {
    const states: StateVarData[] = [];
    for (const id of model.obGenerators()) {
        const data = solution.states[id];
        if (data !== undefined) {
            states.push({
                name: model.obGeneratorLabel(id)?.join(".") ?? "",
                data,
            });
        }
    }
    return { time: solution.time, states };
}

/** Internal helper that both `createModelODEPlot` and `createModelODEPlotWithEquations` delegate to. */
function createWorkerSimulation<T>(
    liveModel: LiveModelDoc,
    analysisId: string,
    params: Accessor<unknown>,
    mapOk: (response: SimulationResponse & { tag: "Ok" }, model: DblModel) => T,
    mapErr: (error: string) => T,
): { data: Accessor<T | undefined>; loading: Accessor<boolean> } {
    const DEBOUNCE_MS = 150;

    const [data, setData] = createSignal<T | undefined>(undefined);
    const [loading, setLoading] = createSignal(false);

    let latestRequestId = 0;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const inputSignal = createMemo(() => ({
        validatedModel: liveModel.validatedModel(),
        params: params(),
        notebook: liveModel.liveDoc.doc.notebook,
        theoryId: liveModel.liveDoc.doc.theory,
        refId: liveModel.liveDoc.docHandle.documentId,
    }));

    createEffect(
        on(inputSignal, (input) => {
            clearTimeout(debounceTimer);

            const {
                validatedModel,
                params: currentParams,
                notebook: currentNotebook,
                theoryId: currentTheoryId,
                refId: currentRefId,
            } = input;

            if (!validatedModel || validatedModel.tag !== "Valid" || !currentNotebook) {
                setData(undefined);
                setLoading(false);
                return;
            }

            setLoading(true);

            debounceTimer = setTimeout(() => {
                const requestId = ++requestIdCounter;
                latestRequestId = requestId;

                const request: SimulationRequest = {
                    requestId,
                    theoryId: currentTheoryId,
                    analysisId,
                    notebook: unwrap(currentNotebook),
                    refId: currentRefId,
                    params: unwrap(currentParams),
                };

                postToWorker(request)
                    .then((response) => {
                        if (requestId !== latestRequestId) {
                            return;
                        }

                        setLoading(false);

                        if (response.tag === "Ok") {
                            const model = liveModel.validatedModel();
                            if (model?.tag === "Valid") {
                                setData(() => mapOk(response, model.model));
                            } else {
                                setData(undefined);
                            }
                        } else {
                            setData(() => mapErr(response.error));
                        }
                    })
                    .catch((err) => {
                        if (requestId !== latestRequestId) {
                            return;
                        }
                        setLoading(false);
                        setData(() => mapErr(String(err)));
                    });
            }, DEBOUNCE_MS);
        }),
    );

    onCleanup(() => {
        clearTimeout(debounceTimer);
    });

    return { data, loading };
}

/** Reactively simulate and plot an ODE via web worker.

Sends the simulation to a background worker thread and returns the result
reactively. The result is debounced to avoid firing many simulations on
rapid parameter changes.
 */
export function createModelODEPlot(
    liveModel: LiveModelDoc,
    analysisId: string,
    params: Accessor<unknown>,
): ODEPlotResult {
    return createWorkerSimulation<JsResult<ODEPlotData, string>>(
        liveModel,
        analysisId,
        params,
        (response, model) => {
            const plotData = serializedSolutionToPlotData(model, response.solution);
            return { tag: "Ok", content: plotData };
        },
        (error) => ({ tag: "Err", content: error }),
    );
}

/** Reactively simulate an ODE with equations via web worker.

Returns both plot data and LaTeX equations.
 */
export function createModelODEPlotWithEquations(
    liveModel: LiveModelDoc,
    analysisId: string,
    params: Accessor<unknown>,
): ODEPlotResultWithEquations {
    return createWorkerSimulation<ODEPlotDataWithEquations>(
        liveModel,
        analysisId,
        params,
        (response, model) => {
            const plotData = serializedSolutionToPlotData(model, response.solution);
            return {
                plotData: { tag: "Ok", content: plotData },
                latexEquations: response.hasEquations ? response.latexEquations : [],
            };
        },
        (error) => ({
            plotData: { tag: "Err", content: error },
            latexEquations: [],
        }),
    );
}

/** Reactively compute the symbolic ODE equations for a model in LaTeX.

This stays on the main thread as it is typically fast.
 */
export function createModelODELatex(
    validatedModel: Accessor<ValidatedModel | undefined>,
    getEquations: (model: DblModel) => ODELatex,
) {
    return createMemo<LatexEquation[] | undefined>(
        () => {
            const validated = validatedModel();
            if (validated?.tag !== "Valid") {
                return;
            }
            const model = validated.model;
            const latex = getEquations(model);
            return latex;
        },
        undefined,
        { equals: false },
    );
}
