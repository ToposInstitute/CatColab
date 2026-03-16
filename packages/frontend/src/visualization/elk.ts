import type {
    ELK,
    ElkEdgeSection,
    ElkExtendedEdge,
    ElkLabel,
    ElkLayoutArguments,
    ElkNode,
    LayoutOptions,
} from "elkjs";
import invariant from "tiny-invariant";

import type * as GraphLayout from "./graph_layout";
import type * as GraphSpec from "./graph_spec";
import { measureText } from "./measure";
import type { ArrowStyle } from "./types";

/** ELK node with extra style data attached.

ELK will ignore this extra data and just pass it through.
 */
interface StyledElkNode extends ElkNode {
    children?: StyledElkNode[];
    edges?: StyledElkEdge[];
    cssClass?: string;
}

interface StyledElkEdge extends ElkExtendedEdge {
    cssClass?: string;
    arrowStyle?: ArrowStyle;
}

const nodePadding = 10;

/** Convert a graph specification into an ELK node.

List of layout options supported by ELK:
<https://eclipse.dev/elk/reference/options.html>
 */
export function graphToElk(graph: GraphSpec.Graph, layoutOptions?: LayoutOptions): ElkNode {
    const canvas = document.createElement("canvas");

    const defaultFont = `1rem ${getComputedStyle(document.documentElement)
        .getPropertyValue("--main-font")
        .trim()}`;
    const monospaceFont = `1rem ${getComputedStyle(document.documentElement)
        .getPropertyValue("--mono-font")
        .trim()}`;

    const children: StyledElkNode[] = graph.nodes.map((node) => {
        let width = node.minimumWidth ?? nodePadding;
        let height = node.minimumHeight ?? nodePadding;
        if (node.label) {
            const font = node.isMonospaced ? monospaceFont : defaultFont;
            const size = measureText(canvas, node.label, font);
            width = Math.max(width, size.width + 2 * nodePadding);
            height = Math.max(height, size.height + 2 * nodePadding);
        }
        return {
            id: node.id,
            labels: node.label ? [{ text: node.label }] : [],
            width,
            height,
            cssClass: node.cssClass,
        };
    });

    const edges: StyledElkEdge[] = graph.edges.map((edge) => {
        let label: ElkLabel | undefined;
        if (edge.label) {
            const font = edge.isMonospaced ? monospaceFont : defaultFont;
            const { width, height } = measureText(canvas, edge.label, font);
            label = { text: edge.label, width, height };
        }
        return {
            id: edge.id,
            sources: [edge.source],
            targets: [edge.target],
            labels: label ? [label] : [],
            cssClass: edge.cssClass,
            arrowStyle: edge.style,
        };
    });

    return { id: "root", children, edges, layoutOptions };
}

/** Asynchronously import and load ELK. */
export async function loadElk() {
    const ELK = (await import("elkjs")).default;
    return new ELK();
}

/** Lay out a graph using ELK. */
export async function elkLayoutGraph(
    elk: ELK,
    graph: StyledElkNode,
    args?: ElkLayoutArguments,
): Promise<GraphLayout.Graph> {
    const result = await elk.layout(graph, args);
    return parseElkLayout(result);
}

/** Parse a graph layout computed by ELK. 

ELK's coordinate system is described at:
<https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/coordinatesystem.html>.
*/
export function parseElkLayout(elk: StyledElkNode): GraphLayout.Graph {
    // Parse nodes from the children of the root ELK node.
    const nodes: GraphLayout.Node[] = [];
    for (const child of elk.children ?? []) {
        const width = child.width ?? 0;
        const height = child.height ?? 0;
        nodes.push({
            id: child.id,
            // ELK positions are from the top-left corner; convert to center.
            pos: {
                x: (child.x ?? 0) + width / 2,
                y: (child.y ?? 0) + height / 2,
            },
            width,
            height,
            label: child.labels?.[0]?.text,
            cssClass: child.cssClass,
        });
    }

    // Parse edges of the root ELK node.
    const edges: GraphLayout.Edge[] = [];
    for (const edge of elk.edges ?? []) {
        const source = edge.sources[0];
        const target = edge.targets[0];
        invariant(source && target, "Edge should have a source and target");

        const sections = edge.sections ?? [];
        const firstSection = sections[0];
        const lastSection = sections[sections.length - 1];
        invariant(firstSection && lastSection, "Edge should have at least one section");

        const edgeLabel = edge.labels?.[0];
        const labelPos = edgeLabel
            ? {
                  x: (edgeLabel.x ?? 0) + (edgeLabel.width ?? 0) / 2,
                  y: (edgeLabel.y ?? 0) + (edgeLabel.height ?? 0) / 2,
              }
            : undefined;

        edges.push({
            id: edge.id,
            source,
            target,
            label: edgeLabel?.text,
            sourcePos: firstSection.startPoint,
            targetPos: lastSection.endPoint,
            labelPos,
            path: sectionsToPath(sections),
            cssClass: edge.cssClass,
            style: edge.arrowStyle,
        });
    }

    const width = elk.width;
    const height = elk.height;
    return { width, height, nodes, edges };
}

/** Point with x and y coordinates. */
interface Point {
    x: number;
    y: number;
}

/** Convert ELK edge sections to an SVG path. */
function sectionsToPath(sections: ElkEdgeSection[]): string {
    // Collect all points from all sections.
    const points: Point[] = [];
    for (const section of sections) {
        points.push(section.startPoint);
        for (const bp of section.bendPoints ?? []) {
            points.push(bp);
        }
        points.push(section.endPoint);
    }

    // Simplify the path by removing unnecessary bends.
    const simplified = simplifyPath(points);

    // Build SVG path string.
    const stmts: Array<string | number> = [];
    for (const pt of simplified) {
        stmts.push(stmts.length === 0 ? "M" : "L", pt.x, pt.y);
    }
    return stmts.join(" ");
}

/** Remove unnecessary bends from a path.

ELK produces near-orthogonal paths with small (~1px) deviations from
horizontal or vertical due to floating-point rounding. This function snaps
nearly-aligned coordinates to make segments exactly orthogonal, then removes
any resulting collinear points.
 */
function simplifyPath(points: Point[], threshold = 1.5): Point[] {
    if (points.length <= 2) {
        return points;
    }

    // Snap nearly-aligned coordinates between consecutive points.
    const snapped = snapCoordinates(points, threshold);

    // Remove collinear points (now that segments are exactly orthogonal).
    return removeCollinear(snapped);
}

/** Snap coordinates that are nearly equal between consecutive points.

If two consecutive points have X (or Y) values within the threshold, snap the
later point's coordinate to match the earlier one. This turns near-horizontal
segments into exactly horizontal ones (and likewise for vertical).
 */
function snapCoordinates(points: Point[], threshold: number): Point[] {
    const result: Point[] = [points[0]!];
    for (let i = 1; i < points.length; i++) {
        const prev = result[result.length - 1]!;
        const curr = points[i]!;
        result.push({
            x: Math.abs(curr.x - prev.x) <= threshold ? prev.x : curr.x,
            y: Math.abs(curr.y - prev.y) <= threshold ? prev.y : curr.y,
        });
    }
    return result;
}

/** Remove points that are collinear with their neighbors. */
function removeCollinear(points: Point[]): Point[] {
    if (points.length <= 2) {
        return points;
    }
    const result: Point[] = [points[0]!];
    for (let i = 1; i < points.length - 1; i++) {
        const prev = result[result.length - 1]!;
        const curr = points[i]!;
        const next = points[i + 1]!;
        // Skip if all three are on the same horizontal or vertical line.
        const sameX = prev.x === curr.x && curr.x === next.x;
        const sameY = prev.y === curr.y && curr.y === next.y;
        if (!sameX && !sameY) {
            result.push(curr);
        }
    }
    result.push(points[points.length - 1]!);
    return result;
}
