import type { ArrowStyle } from "./types";

/** Graph with a layout.

The coordinate system is that of SVG and HTML canvas, meaning that the origin is
in the top-left corner.
 */
export interface Graph<Id> {
    /** Width of bounding box for graph. */
    width?: number;

    /** Height of bounding box for graph. */
    height?: number;

    /** Nodes of graph. */
    nodes: Array<Node<Id>>;

    /** Edges of graph. */
    edges: Array<Edge<Id>>;
}

export interface Node<Id> extends GraphElement {
    id: Id;

    /** Position of node, with origin at center of node. */
    pos: Point;

    /** Width of bounding box for node. */
    width: number;

    /** Height of bounding box for node. */
    height: number;

    /** Node label, if any. */
    label?: string;
}

export interface Edge<Id> extends GraphElement {
    id?: Id;

    /** Source node of edge. */
    source: Id;

    /**  Target node of edge. */
    target: Id;

    /** Edge label, if any. */
    label?: string;

    /** Position of source of edge. */
    sourcePos: Point;

    /** Position of target of edge. */
    targetPos: Point;

    /** Position of center of label. */
    labelPos?: Point;

    /** Path for the edge in SVG path data format. */
    path?: string;

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
