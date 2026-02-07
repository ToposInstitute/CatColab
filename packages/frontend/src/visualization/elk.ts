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

/** Elk node with extra styling data attached.

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

/** Convert a graph specification into an ELK node. */
export function graphToElk(graph: GraphSpec.Graph, layoutOptions?: LayoutOptions): ElkNode {
    const canvas = document.createElement("canvas");

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

const nodePadding = 10;

// XXX: How do we properly set these?
const defaultFont = "1rem sans-serif";
const monospaceFont = "1rem monospace";

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

For a description of the ELK coordinate system, see:
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

/** Convert ELK edge sections to an SVG path. */
function sectionsToPath(sections: ElkEdgeSection[]): string {
    const stmts: Array<string | number> = [];
    for (const section of sections) {
        stmts.push(stmts.length === 0 ? "M" : "L", section.startPoint.x, section.startPoint.y);
        for (const bp of section.bendPoints ?? []) {
            stmts.push("L", bp.x, bp.y);
        }
        stmts.push("L", section.endPoint.x, section.endPoint.y);
    }
    return stmts.join(" ");
}
