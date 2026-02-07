import type { ArrowStyle } from "./types";

/** Graph with a layout.

The coordinate system is that of SVG and HTML canvas, meaning that the origin is
in the top-left corner.
 */
export interface Graph {
    /** Width of bounding box for graph. */
    width?: number;

    /** Height of bounding box for graph. */
    height?: number;

    /** Nodes of graph. */
    nodes: Array<Node>;

    /** Edges of graph. */
    edges: Array<Edge>;
}

export interface Node extends GraphElement {
    id: string;

    /** Position of node, with origin at center of node. */
    pos: Point;

    /** Width of bounding box for node. */
    width: number;

    /** Height of bounding box for node. */
    height: number;

    /** Node label, if any. */
    label?: string;
}

export interface Edge extends GraphElement {
    id?: string;

    /** Source node of edge. */
    source: string;

    /**  Target node of edge. */
    target: string;

    /** Edge label, if any. */
    label?: string;

    /** Position of source of edge. */
    sourcePos: Point;

    /** Position of target of edge. */
    targetPos: Point;

    /** Position of center of label. */
    labelPos?: Point;

    /** Path for the edge in SVG path data format. */
    path: string;

    /** Style of edge, according to our own taxonomy. */
    style?: ArrowStyle;
}

export interface GraphElement {
    /** CSS class (or classes) to apply to element. */
    cssClass?: string;
}

/** Point in a 2D cartesian coordinate system.
 */
export type Point = {
    x: number;
    y: number;
};
