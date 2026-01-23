import { type Accessor, createMemo } from "solid-js";

import type {
    DblModel,
    JsResult,
    LatexEquation,
    ODELatex,
    ODEResult,
    ODEResultWithEquations,
} from "catlog-wasm";
import type { ValidatedModel } from "../../model";
import type { ODEPlotData, StateVarData } from "../../visualization";

/** Result of simulating an ODE with equations, containing both plot data and LaTeX equations. */
export type ODEPlotDataWithEquations = {
    plotData: JsResult<ODEPlotData, string>;
    latexEquations: LatexEquation[];
};

/** Convert an ODE solution result to plot data for a model. */
function solutionToPlotData(
    model: DblModel,
    solutionResult: ODEResult,
): JsResult<ODEPlotData, string> {
    if (solutionResult?.tag !== "Ok") {
        return solutionResult;
    }
    const solution = solutionResult.content;

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
    return { tag: "Ok", content: { time: solution.time, states } };
}

/** Reactively simulate and plot an ODE derived from a model.

Assumes that the variables in the ODE come from objects in the model.
 */
export function createModelODEPlot(
    validatedModel: Accessor<ValidatedModel | undefined>,
    simulate: (model: DblModel) => ODEResult,
) {
    return createMemo<JsResult<ODEPlotData, string> | undefined>(
        () => {
            const validated = validatedModel();
            if (validated?.tag !== "Valid") {
                return;
            }
            const model = validated.model;
            const solutionResult = simulate(model);
            return solutionToPlotData(model, solutionResult);
        },
        undefined,
        { equals: false },
    );
}

/** Reactively simulate an ODE with equations derived from a model.

Returns both plot data and LaTeX equations.
 */
export function createModelODEPlotWithEquations(
    validatedModel: Accessor<ValidatedModel | undefined>,
    simulate: (model: DblModel) => ODEResultWithEquations,
) {
    return createMemo<ODEPlotDataWithEquations | undefined>(
        () => {
            const validated = validatedModel();
            if (validated?.tag !== "Valid") {
                return;
            }
            const model = validated.model;
            const result = simulate(model);
            const plotData = solutionToPlotData(model, result.solution);
            return { plotData, latexEquations: result.latexEquations };
        },
        undefined,
        { equals: false },
    );
}

/** Reactively compute the symbolic ODE equations for a model in LaTeX.

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
