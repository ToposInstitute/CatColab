import { defineAnalysis } from "catcolab-documents";

import { ThSymMonoidalCategory } from "catlog-wasm";

/** Visualize a model as a graph.

Analyses live in their own package, separate from the logics they apply to. An
analysis is attached to a logic by listing it in the logic's `modelAnalyses`
(see `catcolab-logics/simple-olog`); the analysis itself declares its `id`
(unique relative to the logic), the `initialContent` created when an analysis
cell is added, and an async `run` that computes the analysis's output from the
analyzed model's elaborated `DblModel`. The cell resolves and validates that
model through the store (via `getHandle`, elaborating against the analysis
shape's `analysisOfCoreTheory`) before invoking `run`, so `run` receives the
elaborated model directly.

`content` is the persisted, user-editable config stored on the cell. For a
visualization it is a graph-layout config: a `layout` engine and an optional
`direction`/`separation`. The config parametrizes *rendering*; it is not part of
the run output.

`run` produces the abstract graph — lists of nodes and edges derived from the
elaborated model — without any layout applied. */
export const Visualization = defineAnalysis({
    id: "diagram",
    initialContent: (): { layout: string; direction?: string } => ({ layout: "graphviz-directed" }),
    run: async (elaborated) => {
        return {
            nodes: elaborated.obGenerators().map((id) => ({
                id,
                label: elaborated.obPresentation(id).label?.join(".") ?? "",
            })),
            edges: elaborated.morGenerators().flatMap((id) => {
                const mor = elaborated.morPresentation(id);
                if (!(mor && mor.dom.tag === "Basic" && mor.cod.tag === "Basic")) {
                    return [];
                }
                return [
                    {
                        id,
                        source: mor.dom.content,
                        target: mor.cod.content,
                        label: mor.label?.join(".") ?? "",
                    },
                ];
            }),
        };
    },
});

/** Simulate a Petri-net model using mass-action kinetics.

`run` builds a mass-action ODE from the elaborated model using
`ThSymMonoidalCategory.massAction`, and resamples the solver output at
`step`-sized intervals to produce a trajectory with one sample per step.

`initialValues` maps object handle ids (the `id` field of an `ObjectCell`) to
initial population values; entries absent from the map default to 0. `rates`
defaults to 1 for every transition generator found in the elaborated model. */
export const Simulation = defineAnalysis({
    id: "simulation",
    initialContent: () => ({
        duration: 10,
        step: 1,
        initialValues: {} as Record<string, number>,
    }),
    run: async (elaborated, params) => {
        const th = new ThSymMonoidalCategory();

        const obGens = elaborated.obGenerators();
        const morGens = elaborated.morGenerators();

        // Default rate = 1 for every transition generator.
        const rates: Record<string, number> = {};
        for (const id of morGens) {
            rates[id] = 1;
        }

        // Map initialValues: object handle ids (= judgment ids) are used
        // directly as qualified names in the elaborated model.
        const initialValues: Record<string, number> = {};
        for (const [id, value] of Object.entries(params.initialValues)) {
            initialValues[id] = value;
        }

        const data = {
            massConservationType: { type: "Balanced" as const },
            rates,
            transitionProductionRates: {},
            transitionConsumptionRates: {},
            placeProductionRates: {},
            placeConsumptionRates: {},
            initialValues,
            duration: params.duration,
        };

        const massResult = th.massAction(elaborated, data);
        const sol = massResult.solution;
        if (sol?.tag !== "Ok") {
            throw new Error(
                `Simulation failed: ${sol?.tag === "Err" ? (sol as { tag: "Err"; content: string }).content : "unknown error"}`,
            );
        }

        const solution = sol.content;
        const { step, duration } = params;

        // Resample the solver output at step-sized intervals [0, step, 2*step, ..., duration].
        const times: number[] = [];
        for (let t = 0; t <= duration + step * 0.001; t += step) {
            times.push(Math.round(t * 1e9) / 1e9);
        }

        const states = obGens.map((id) => {
            const solValues = solution.states.get(id) ?? [];
            const values = times.map((t) => {
                const idx = solution.time.findIndex((st) => st >= t);
                const i = idx < 0 ? solution.time.length - 1 : idx;
                return solValues[i] ?? 0;
            });
            const label = elaborated.obPresentation(id)?.label?.join(".") ?? "";
            return { label, values };
        });

        return { time: times, states };
    },
});
