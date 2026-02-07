import type { ELK, ElkEdgeSection, ElkLayoutArguments, ElkNode } from "elkjs";
import invariant from "tiny-invariant";

import type * as GraphLayout from "./graph_layout";

/** Asynchronously import and load ELK. */
export async function loadElk() {
    const ELK = (await import("elkjs")).default;
    return new ELK();
}

/** Lay out a graph using ELK. */
export async function elkLayoutGraph(
    elk: ELK,
    graph: ElkNode,
    args?: ElkLayoutArguments,
): Promise<GraphLayout.Graph<string>> {
    const result = await elk.layout(graph, args);
    return parseElkLayout(result);
}

/** Parse a graph layout computed by ELK. 

For a description of the ELK coordinate system, see:
<https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/coordinatesystem.html>.
*/
export function parseElkLayout(elk: ElkNode): GraphLayout.Graph<string> {
    // Parse nodes from the children of the root ELK node.
    const nodes: GraphLayout.Node<string>[] = [];
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
        });
    }

    // Parse edges of the root ELK node.
    const edges: GraphLayout.Edge<string>[] = [];
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
        if (stmts.length === 0) {
            stmts.push("M", section.startPoint.x, section.startPoint.y);
        } else {
            stmts.push("L", section.startPoint.x, section.startPoint.y);
        }

        for (const bp of section.bendPoints ?? []) {
            stmts.push("L", bp.x, bp.y);
        }

        stmts.push("L", section.endPoint.x, section.endPoint.y);
    }

    return stmts.join(" ");
}
