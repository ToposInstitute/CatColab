
/** Graph with a layout.

The coordinate system is that of SVG and HTML canvas, meaning that the origin is
in the top-left corner.
 */
export type Graph<Id> = {
    /** Width of bounding box for graph. */
    width?: number;

    /** Height of bounding box for graph. */
    height?: number;

    nodes: Array<Node<Id>>;

    edges: Array<Edge<Id>>;
};

export type Node<Id> = {
    id: Id;

    /** x coordinate of node, with origin at center of node. */
    x: number;

    /** y coordinate of node, with origin at center of node. */
    y: number;

    /** Width of bounding box for node. */
    width: number;

    /** Height of bounding box for node. */
    height: number;

    /** Node label, if any. */
    label?: string;
}

export type Edge<Id> = {
    id?: Id;

    /** Source node of edge. */
    source: Id,

    /**  Target node of edge. */
    target: Id,

    /** Edge label, if any. */
    label?: string;
}
