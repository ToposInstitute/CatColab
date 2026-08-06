import type { ArrowStyle } from "./types";

/** A graph specified by lists of nodes and edges.

This type exists only to define a tool-agnostic input format for our graph
layout and rendering pipeline. It is not intended as a generic data format for
graphs.
 */
export interface Graph {
    /** Nodes of graph. */
    nodes: Array<Node>;

    /** Edges of graph. */
    edges: Array<Edge>;
}

export interface Node extends GraphElement {
    /** Identifier of node, unique within graph. */
    id: string;

    /** Node label, if any.

    The label should provided if it will be rendered downstream, as graph layout
    engines may take it into account when sizing the node.
    */
    label?: string;

    /** Minimum width of node. */
    minimumWidth?: number;

    /** Minimum height of node. */
    minimumHeight?: number;
}

export interface Edge extends GraphElement {
    /** Identifier of edge, unique within graph. */
    id: string;

    /** Source node of edge. */
    source: string;

    /**  Target node of edge. */
    target: string;

    /** Edge label, if any. */
    label?: string;

    /** Style of edge. */
    style?: ArrowStyle;
}

export interface GraphElement {
    /** CSS class (or classes) to apply to element. */
    cssClass?: string;

    /** Whether the label is set in a monospace font. */
    isMonospaced?: boolean;
}
