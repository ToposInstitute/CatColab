import type {
    ELK,
    ElkEdgeSection,
    ElkExtendedEdge,
    ElkLayoutArguments,
    ElkNode,
    LayoutOptions,
} from "elkjs";
import invariant from "tiny-invariant";

import type * as GraphLayout from "./graph_layout";
import type * as GraphSpec from "./graph_spec";

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
}

/** Convert a graph specification into an ELK node. */
export function graphToElk(graph: GraphSpec.Graph, layoutOptions?: LayoutOptions): ElkNode {
    const children: StyledElkNode[] = graph.nodes.map((node) => ({
        id: node.id,
        labels: node.label ? [{ text: node.label }] : [],
        width: node.minimumWidth ?? 50,
        height: node.minimumHeight ?? 50,
        cssClass: node.cssClass,
    }));

    const edges: StyledElkEdge[] = graph.edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
        labels: edge.label ? [{ text: edge.label, width: 50 }] : [],
        cssClass: edge.cssClass,
    }));

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
