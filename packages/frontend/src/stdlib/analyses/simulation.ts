import { type Accessor, createMemo } from "solid-js";

import type { DblModel, JsResult, ODEResult } from "catlog-wasm";
import type { LiveModelDocument } from "../../model";
import type { ODEPlotData } from "../../visualization";

/** Reactively simulate and plot an ODE derived from a model.

Assumes that the variables in the ODE come from objects in the model.
 */
export function createModelODEPlot(
    liveModel: Accessor<LiveModelDocument>,
    simulate: (model: DblModel) => ODEResult,
) {
    return createMemo<JsResult<ODEPlotData, string> | undefined>(
        () => {
            const validated = liveModel().validatedModel();
            if (validated?.result.tag !== "Ok") {
                return;
            }

            const simulationResult = simulate(validated.model);
            if (simulationResult?.tag !== "Ok") {
                return simulationResult;
            }

            const solution = simulationResult.content;
            const obIndex = liveModel().objectIndex();
            const content = {
                time: solution.time,
                states: Array.from(solution.states.entries()).map(
                    ([id, data]) => ({
                        name: obIndex.map.get(id) ?? "",
                        data,
                    }),
                ),
            };
            return { tag: "Ok", content };
        },
        undefined,
        { equals: false },
    );
}
