import type * as Viz from "@viz-js/viz";

/** Graph layout engine supported by CatColab.

Currently we just use Graphviz. In the future we may support other tools.
 */
type LayoutEngine = "graphviz-directed" | "graphviz-undirected";

/** Configuration for an analysis that visualizes a graph. */
export type GraphContent = {
    tag: "graph";

    /** Layout engine for graph. */
    layout: LayoutEngine;
};

export function graphvizEngine(layout: LayoutEngine): Viz.RenderOptions["engine"] {
    if (layout === "graphviz-directed") {
        return "dot";
    } else if (layout === "graphviz-undirected") {
        return "neato";
    }
}

/** Top-level attributes of a Graphviz graph. */
export type GraphvizAttributes = {
    graph?: Viz.Graph["graphAttributes"];
    node?: Viz.Graph["nodeAttributes"];
    edge?: Viz.Graph["edgeAttributes"];
};

/** Default graph attributes for Graphviz. */
export const defaultGraphAttributes: Required<Viz.Graph>["graphAttributes"] = {
    nodesep: "0.5",
};

/** Default node attributes for Graphviz. */
export const defaultNodeAttributes: Required<Viz.Graph>["nodeAttributes"] = {
    // XXX: How to set the font size?
    fontsize: "20",
    shape: "box",
    width: 0,
    height: 0,
};

/** Default edge attributes for Graphviz. */
export const defaultEdgeAttributes: Required<Viz.Graph>["edgeAttributes"] = {
    fontsize: "20",
    sep: "5",
};
