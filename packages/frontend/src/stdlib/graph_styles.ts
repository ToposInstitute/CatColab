import type * as Viz from "@viz-js/viz";

import type { BaseTypeMeta } from "../theory";
import type { GraphvizAttributes } from "../visualization";
import textStyles from "./text_styles.module.css";

/** Default graph attributes for Graphviz. */
export const defaultGraphAttributes: Required<Viz.Graph>["graphAttributes"] = {
    nodesep: "0.5",
};

/** Default node attributes for Graphviz. */
export const defaultNodeAttributes: Required<Viz.Graph>["nodeAttributes"] = {
    // XXX: How to choose the font size?
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

/** Default top-level attributes for Graphviz. */
export const defaultGraphvizAttributes: GraphvizAttributes = {
    graph: defaultGraphAttributes,
    node: defaultNodeAttributes,
    edge: defaultEdgeAttributes,
};

/** Whether the label is set in a monospace font. */
export const isMonospaced = (meta?: BaseTypeMeta): boolean =>
    meta?.textClasses?.includes(textStyles.code) ?? false;

/** CSS classes applied to a node in an SVG graph. */
export const svgNodeCssClasses = (meta?: BaseTypeMeta): string[] => [
    ...(meta?.svgClasses ?? ["node"]),
    ...(meta?.textClasses ?? []),
];

/** CSS classes applied to an edge in an SVG graph. */
export const svgEdgeCssClasses = (meta?: BaseTypeMeta): string[] => [
    ...(meta?.svgClasses ?? ["edge"]),
    ...(meta?.textClasses ?? []),
];
