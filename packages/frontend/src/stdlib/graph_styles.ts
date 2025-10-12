import type * as Viz from "@viz-js/viz";

import type { BaseTypeMeta } from "../theory";

import textStyles from "./text_styles.module.css";

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
