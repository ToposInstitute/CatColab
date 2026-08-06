import { defineAnalysis } from "catcolab-documents";
import type * as GraphSpec from "./visualization/graph_spec";
import { renderGraphSVG } from "./visualization/graph_svg";
import { graphToViz, loadViz, vizLayoutGraph } from "./visualization/graphviz";

/** Visualize a model as a graph.

Analyses live in their own package, separate from the logics they apply to. An
analysis is attached to a logic by listing it in the logic's `modelAnalyses`
(see `catcolab-logics/simple-olog`); the analysis itself declares its `id`
(unique relative to the logic), the `getInitialParams` created when an analysis
cell is added, and an async `run` that computes the analysis's output from the
analyzed model's elaborated `DblModel`. The cell resolves and validates that
model through the store (via `getHandle`, elaborating against the analysis
shape's `analysisOfCoreTheory`) before invoking `run`, so `run` receives the
elaborated model directly.

`content` is the persisted, user-editable config stored on the cell. For a
visualization it is a graph-layout config: a `layout` engine and an optional
`direction`/`separation`. The config parametrizes *rendering*; it is not part of
the run output.

`run` reproduces the frontend's visualization pipeline (ported from
`packages/frontend/src/visualization`): it derives an abstract graph — lists of
nodes and edges — from the elaborated model, lays it out with Graphviz (compiled
to WebAssembly via `@viz-js/viz`, using only Graphviz's `json0` layout output),
and then renders the layout to a self-contained SVG string. The renderer
reproduces the markup of the frontend's `GraphSVG` component, but builds it as a
plain string with `vhtml` (no DOM or framework runtime) so it runs headlessly.
The `layout` engine and `direction` from the config select the Graphviz engine
(`dot`/`neato`) and rank direction (`TB`/`LR`). */
export type VisualizationParams = {
    /** The graph-layout engine. */
    layout: "graphviz-directed" | "graphviz-undirected";
    /** Optional layout direction. */
    direction?: "horizontal" | "vertical";
};

/** The rendered visualization {@link Visualization} produces. */
export type VisualizationResult = {
    /** The visualization rendered as an SVG document. */
    svg: string;
};

/** Convert a params engine to the corresponding Graphviz layout engine. */
function graphvizEngine(layout: VisualizationParams["layout"]): "dot" | "neato" {
    return layout === "graphviz-undirected" ? "neato" : "dot";
}

export const Visualization = defineAnalysis({
    id: "diagram",
    getInitialParams: (): VisualizationParams => ({ layout: "graphviz-directed" }),
    run: async (elaborated, params: VisualizationParams): Promise<VisualizationResult> => {
        // Derive the abstract graph from the elaborated model.
        const spec: GraphSpec.Graph = {
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

        // Lay out the graph with Graphviz, then render the layout to SVG with a
        // string renderer that mirrors the frontend's `GraphSVG` markup.
        const viz = await loadViz();
        const layout = vizLayoutGraph(viz, graphToViz(spec), {
            engine: graphvizEngine(params.layout),
            graphAttributes: {
                rankdir: params.direction === "horizontal" ? "LR" : "TB",
            },
        });
        return { svg: renderGraphSVG(layout) };
    },
});
