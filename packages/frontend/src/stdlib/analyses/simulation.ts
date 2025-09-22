import { type Accessor, createMemo } from "solid-js";

import type { DblModel, JsResult, ODEResult } from "catlog-wasm";
import type { LiveModelDocument } from "../../model";
import type { ODEPlotData, StateVarData } from "../../visualization";

/** Reactively simulate and plot an ODE derived from a model.

Assumes that the variables in the ODE come from objects in the model.
 */
export function createModelODEPlot(
    liveModel: Accessor<LiveModelDocument>,
    simulate: (model: DblModel) => ODEResult,
    iterationCount: Accessor<number>,
) {
    return createMemo<JsResult<ODEPlotData, string> | undefined>(
        () => {
            const validated = liveModel().validatedModel();
            if (validated?.tag !== "Valid") {
                return;
            }

            const model = validated.model;
            const simulationResult = simulate(model);
            if (simulationResult?.tag !== "Ok") {
                return simulationResult;
            }
            const solution = simulationResult.content;

            const states: StateVarData[] = [];
            for (const id of model.obGenerators()) {
                const data = solution.states.get(id);
                if (data !== undefined) {
                    states.push({
                        name: model.obGeneratorLabel(id)?.join(".") ?? "",
                        data,
                    });
                }
            }
            const content = { time: solution.time, states, iterationCount: iterationCount() };
            return { tag: "Ok", content };
        },
        undefined,
        { equals: false },
    );
}
