import type * as Viz from "@viz-js/viz";

import { ArrowStyle } from "./types";
import * as GraphvizJSON from "./graphviz_json";
import { Point } from "./graph_layout";
import * as GraphLayout from "./graph_layout";


/** Asynchronously import and load Viz.js.
 */
export async function loadViz() {
    const { instance } = await import("@viz-js/viz");
    const viz = await instance();
    return viz;
}

/** Render a Graphviz graph using the Graphviz `json0` format.
 */
export function vizRenderJSON0(viz: Viz.Viz, graph: Viz.Graph,
                               options?: Viz.RenderOptions) {
    // We use `renderString` rather than the convenience method `renderJSON`
    // since we need only `json0` output, not the full `json` output.
    const result = viz.renderString(graph, {
        ...options,
        format: "json0",
    });
    return JSON.parse(result) as GraphvizJSON.Graph;
}


/** Parse a graph layout from Graphviz `json0` output.

The predecessor to this code is Evan's defunct package
[`wiring-diagram-canvas`](https://github.com/epatters/wiring-diagram-canvas/blob/master/src/graphviz.ts).
 */
export function parseGraphvizJSON(
    graphviz: GraphvizJSON.Graph
): GraphLayout.Graph<string> {
    // Parse bounding box and padding and use them to transform coordinates.
    //
    // Graphviz uses the standard Cartesian coordinate system (origin in bottom
    // left corner), whereas SVG uses the HTML canvas coordinate system (origin
    // in top left corner). It seems, but is not documented, that the first two
    // numbers in the Graphviz bounding box are always (0,0).
    const bb = parseFloatArray(graphviz.bb);
    const pad: Point = {x: 0, y: 0};
    if (graphviz.pad) {
        const gvPad = parsePoint(graphviz.pad);
        [pad.x, pad.y] = [inchesToPoints(gvPad.x), inchesToPoints(gvPad.y)];
    }
    const transformPoint = (point: Point): Point =>
        ({ x: point.x + pad.x, y: bb[3] - point.y + pad.y });
    const [width, height] = [bb[2] + 2*pad.x, bb[3] + 2*pad.y];

    // Parse nodes of graph, ignoring any subgraphs.
    const nodes: GraphLayout.Node<string>[] = [];
    const offset = graphviz._subgraph_cnt;
    const nodeByNumber = (i: number) => nodes[i - offset];
    for (const node of
         graphviz.objects?.slice(offset) as GraphvizJSON.Node[] ?? []) {
        const id = node.id || node.name;
        nodes.push({
            id,
            pos: transformPoint(parsePoint(node.pos)),
            width: inchesToPoints(parseFloat(node.width)),
            height: inchesToPoints(parseFloat(node.height)),
            label: node.label,
            cssClass: node.class,
        });
    }

    // Parse edge of graph.
    const edges: GraphLayout.Edge<string>[] = [];
    for (const edge of graphviz.edges ?? []) {
        if (edge.style === "invis") {
            // Omit invisible edges, used to tweak the layout in Graphviz.
            continue;
        }
        const spline = parseSpline(edge.pos, transformPoint);
        const { points } = spline;
        edges.push({
            id: edge.id,
            source: nodeByNumber(edge.head).id,
            target: nodeByNumber(edge.tail).id,
            label: edge.xlabel ?? edge.label,
            sourcePos: spline.startPoint || points[0],
            targetPos: spline.endPoint || points[points.length - 1],
            labelPos:
                (edge.xlp && transformPoint(parsePoint(edge.xlp))) ||
                (edge.lp && transformPoint(parsePoint(edge.lp))) ||
                undefined,
            path: splineToPath(spline),
            cssClass: edge.class,
            style: edge.arrowstyle as ArrowStyle,
        });
    }

    return { width, height, nodes, edges };
}


/* Parse Graphviz spline.

   In Graphviz, a "spline" is a cubic B-spline of overlapping cubic Bezier
   curves. It consists of 3n+1 points, where n is the number of Bezier curves.

   References:

   - https://graphviz.org/docs/attr-types/splineType/
   - https://cprimozic.net/notes/posts/graphviz-spline-drawing/
 */
function parseSpline(
    spline: string,
    transformPoint?: (pt: Point) => Point
): GraphvizSpline {
    const points: Point[] = [];
    let startPoint: Point | undefined;
    let endPoint: Point | undefined;
    transformPoint = transformPoint || ((pt: Point) => pt);

    spline.split(" ").forEach((s) => {
        if (s.startsWith("s,")) {
            startPoint = transformPoint(parsePoint(s.slice(2)));
        } else if (s.startsWith("e,")) {
            endPoint = transformPoint(parsePoint(s.slice(2)));
        } else {
            points.push(transformPoint(parsePoint(s)));
        }
    });

    return { points, startPoint, endPoint };
}

/** Convert a spline parsed from Graphviz into SVG path data.
 */
function splineToPath(spline: GraphvizSpline): string {
    const { points, startPoint, endPoint } = spline;

    // Start path.
    const stmts: Array<string | number> = ["M"];
    if (startPoint) {
        stmts.push(startPoint.x, startPoint.y, "L");
    }
    stmts.push(points[0].x, points[0].y);

    // Bezier curves for intermediate segments.
    for (let i = 1; i < points.length; i += 3) {
        const [p1, p2, p3] = [points[i], points[i+1], points[i+2]];
        stmts.push("C", p1.x, `${p1.y},`, p2.x, `${p2.y},`, p3.x, p3.y);
    }

    // End path;
    if (endPoint) {
        stmts.push("L", endPoint.x, endPoint.y);
    }
    return stmts.join(" ");
}

type GraphvizSpline = {
    points: Point[];
    startPoint?: Point;
    endPoint?: Point;
};


/** Parse array of floats in Graphviz's comma-separated format.
 */
function parseFloatArray(s: string): number[] {
    return s.split(",").map(parseFloat);
}

/** Parse a Graphviz point.
 */
function parsePoint(s: string): Point {
    const point = parseFloatArray(s);
    console.assert(point.length === 2);
    return { x: point[0], y: point[1] }
}

// 72 points per inch in Graphviz.
const inchesToPoints = (x: number) => 72 * x;
