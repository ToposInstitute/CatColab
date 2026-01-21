import { type Accessor, createMemo } from "solid-js";

import type { DblModel, JsResult, ODELatex, ODEResult } from "catlog-wasm";
import type { ValidatedModel } from "../../model";
import type { ODEPlotData, StateVarData } from "../../visualization";

/** Replace braced UUIDs in equation strings with human-readable labels from the model. */
function replaceUuidsWithLabels(equation: string, model: DblModel): string {
    const uuidPattern =
        /\{([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\}/g;

    return equation.replace(uuidPattern, (_match, uuid) => {
        const morLabel = model.morGeneratorLabel(uuid);
        if (morLabel) {
            return `r_{\\text{${morLabel.join(".")}}}`;
        }
        const obLabel = model.obGeneratorLabel(uuid);
        if (obLabel) {
            return obLabel.join(".");
        }
        return "\\text{Unnamed}";
    });
}

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

/** Reactively compute the symbolic ODE equations for a model in LaTeX.

Returns equations with UUIDs replaced by human-readable labels.
 */
export function createModelODELatex(
    validatedModel: Accessor<ValidatedModel | undefined>,
    getEquations: (model: DblModel) => ODELatex,
) {
    return createMemo<string[][] | undefined>(
        () => {
            const validated = validatedModel();
            if (validated?.tag !== "Valid") {
                return;
            }
            const model = validated.model;
            const latex = getEquations(model);
            return latex.map((row) => row.map((cell) => replaceUuidsWithLabels(cell, model)));
        },
        undefined,
        { equals: false },
    );
}
