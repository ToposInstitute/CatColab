import type * as Viz from "@viz-js/viz";

import type { BaseTypeMeta } from "../../theory";

import textStyles from "../text_styles.module.css";

/** Graph layout engine supported by CatColab.

Currently we just use Graphviz. In the future we may support other tools.
 */
export enum LayoutEngine {
    GvDirected = "graphviz-directed",
    GvUndirected = "graphviz-undirected",
}

/** Configuration for an analysis that visualizes a graph. */
export type GraphContent = {
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

// XXX: Precise font matching seems impossible here but we'll at least give
// Graphviz a monospace font if and only if we're using one.
export const graphvizFontname = (meta?: BaseTypeMeta): string =>
    meta?.textClasses?.includes(textStyles.code) ? "Courier" : "Helvetica";

// XXX: This should probably go somewhere else.
export const svgCssClasses = (meta?: BaseTypeMeta): string[] => [
    ...(meta?.svgClasses ?? []),
    ...(meta?.textClasses ?? []),
];
