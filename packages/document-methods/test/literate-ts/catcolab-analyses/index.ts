import { defineAnalysis } from "catcolab-documents";

/** Visualize a model as a graph.

Analyses live in their own package, separate from the logics they apply to. An
analysis is attached to a logic by listing it in the logic's `modelAnalyses`
(see `catcolab-logics/simple-olog`); the analysis itself declares its `id`
(unique relative to the logic), the `initialContent` created when an analysis
cell is added, and an async `run` that computes the analysis's output from the
analyzed model.

`content` is the persisted, user-editable config stored on the cell. For a
visualization it is a graph-layout config: a `layout` engine and an optional
`direction`/`separation`. The config parametrizes *rendering*; it is not part of
the run output.

`run` produces the abstract graph — lists of nodes and edges derived from the
elaborated model — without any layout applied. It is asynchronous because
producing the output requires the elaborated, validated model, which may itself
be asynchronous (e.g. a model with instantiations resolves referenced models
through the store). */
export const Visualization = defineAnalysis({
    id: "diagram",
    initialContent: () => ({ layout: "graphviz-directed" }),
    run: async (model) => {
        const result = await model.validate();
        if (result.tag !== "Valid") {
            throw new Error("Cannot visualize a model that does not validate.");
        }
        const elaborated = result.model;
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
