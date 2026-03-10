/** Conversion of undirected wiring diagrams (UWDs) to ELK graphs and parsing
of the resulting layouts.

Boxes represent sub-models, ports represent shared interfaces, and junctions
connect ports across sub-models via undirected wires.
 */

import type { ElkExtendedEdge, ElkNode, ElkPort } from "elkjs";

import type { UWD } from "catlog-wasm";
import {
    type ElkBoxLayout,
    type ElkEdgeLayout,
    type ElkHierarchicalLayout,
    type ElkPortLayout,
    parseElkPortLayout,
    portSize,
    sectionsToPath,
} from "./elk";
import { getMainFont, measureText } from "./font_utils";

const boxPaddingH = 16;
const boxPaddingV = 10;
const outerPadding = 40;
const portSpacing = 12;
const minBoxWidth = 80;
const minBoxHeight = 50;

// Spacing constants for ELK layout options.
const layeredBaseSpacing = 40;
const layeredInterLayerSpacing = 60;
const nodeSpacing = 30;
const outerPortSpacing = 20;

/** Convert a UWD to an ELK hierarchical graph.
 */
export function uwdToElk(uwd: UWD | undefined): ElkNode {
    const elkDirection = "RIGHT";
    const portSide = "EAST";

    const canvas = document.createElement("canvas");
    const font = getMainFont();

    const outerPorts: ElkPort[] = (uwd?.outerPorts ?? []).map((port) => {
        const text = String(port.label);
        const labelSize = measureText(canvas, text, font);
        return {
            id: outerPortId(port.name),
            width: portSize,
            height: portSize,
            labels: [{ text, width: labelSize.width, height: labelSize.height }],
            layoutOptions: {
                "elk.port.side": portSide,
            },
        };
    });

    const boxNodes: ElkNode[] = (uwd?.boxes ?? []).map((box) => {
        const boxLabel = String(box.label);
        const labelSize = measureText(canvas, boxLabel, font);

        const ports: ElkPort[] = box.ports.map((port) => {
            const text = String(port.label);
            const portLabelSize = measureText(canvas, text, font);
            return {
                id: boxPortId(box.name, port.name),
                width: portSize,
                height: portSize,
                labels: [{ text, width: portLabelSize.width, height: portLabelSize.height }],
                layoutOptions: {
                    "elk.port.side": portSide,
                },
            };
        });

        const totalPorts = ports.length;
        const portAreaHeight = totalPorts * (portSize + portSpacing);
        const width = Math.max(minBoxWidth, labelSize.width + 2 * boxPaddingH);
        const height = Math.max(
            minBoxHeight,
            labelSize.height + 2 * boxPaddingV,
            portAreaHeight + 2 * boxPaddingV,
        );

        return {
            id: boxId(box.name),
            labels: [{ text: boxLabel, width: labelSize.width, height: labelSize.height }],
            width,
            height,
            ports,
            layoutOptions: {
                "elk.portConstraints": "FIXED_SIDE",
                "elk.nodeLabels.placement": "INSIDE V_CENTER H_CENTER",
                "elk.portLabels.placement": "OUTSIDE",
                "elk.padding": `[top=${boxPaddingV},left=${boxPaddingH},bottom=${boxPaddingV},right=${boxPaddingH}]`,
                "elk.nodeSize.constraints": "NODE_LABELS PORTS MINIMUM_SIZE",
                "elk.nodeSize.minimum": `(${width},${height})`,
                [`elk.portAlignment.${portSide.toLowerCase()}`]: "CENTER",
                "elk.spacing.portPort": String(portSpacing),
            },
        };
    });

    // Build a map from junction name to its outer port ID.
    const junctionOuterPort = new Map<string, string>();
    if (uwd) {
        for (const port of uwd.outerPorts) {
            if (port.junction != null) {
                junctionOuterPort.set(port.junction, outerPortId(port.name));
            }
        }
    }

    // Build wire edges: connect each box port to its junction's outer port.
    // Combined with ELK's mergeEdges option, edges sharing an outer port are
    // merged along common segments.
    const edges: ElkExtendedEdge[] = [];
    let edgeIndex = 0;

    if (uwd) {
        for (const box of uwd.boxes) {
            for (const port of box.ports) {
                const outerPort =
                    port.junction != null ? junctionOuterPort.get(port.junction) : undefined;
                if (outerPort) {
                    edges.push({
                        id: `wire-${edgeIndex++}`,
                        sources: [outerPort],
                        targets: [boxPortId(box.name, port.name)],
                    });
                }
            }
        }
    }

    const outerNode: ElkNode = {
        id: "outer",
        children: boxNodes,
        ports: outerPorts,
        edges,
        layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": elkDirection,
            "elk.hierarchyHandling": "INCLUDE_CHILDREN",
            "elk.portConstraints": "FIXED_SIDE",
            "elk.portLabels.placement": "OUTSIDE",
            "elk.padding": `[top=${outerPadding},left=${outerPadding},bottom=${outerPadding},right=${outerPadding}]`,
            "elk.nodeSize.constraints": "NODE_LABELS PORTS MINIMUM_SIZE",
            "elk.layered.mergeEdges": "true",
            "elk.layered.spacing.baseValue": String(layeredBaseSpacing),
            "elk.layered.spacing.nodeNodeBetweenLayers": String(layeredInterLayerSpacing),
            "elk.spacing.nodeNode": String(nodeSpacing),
            "elk.spacing.portPort": String(outerPortSpacing),
        },
    };

    return {
        id: "root",
        children: [outerNode],
        layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": elkDirection,
        },
    };
}

/** Parse the ELK layout result into an `ElkHierarchicalLayout`. */
export function parseUwdElkLayout(root: ElkNode): ElkHierarchicalLayout {
    const outerElk = root.children?.[0];
    const outerX = outerElk?.x ?? 0;
    const outerY = outerElk?.y ?? 0;
    const outerWidth = outerElk?.width ?? 0;
    const outerHeight = outerElk?.height ?? 0;

    // Parse outer ports.
    const outerPorts: ElkPortLayout[] = (outerElk?.ports ?? []).map((port) =>
        parseElkPortLayout(port, outerX, outerY),
    );

    const boxes: ElkBoxLayout[] = [];

    for (const child of outerElk?.children ?? []) {
        const cx = outerX + (child.x ?? 0);
        const cy = outerY + (child.y ?? 0);
        const cw = child.width ?? 0;
        const ch = child.height ?? 0;

        const childPorts: ElkPortLayout[] = (child.ports ?? []).map((port) =>
            parseElkPortLayout(port, cx, cy),
        );

        boxes.push({
            x: cx,
            y: cy,
            width: cw,
            height: ch,
            label: child.labels?.[0]?.text ?? "",
            ports: childPorts,
        });
    }

    // Parse wire edges.
    const wireEdges: ElkEdgeLayout[] = [];

    for (const edge of outerElk?.edges ?? []) {
        const path = sectionsToPath(edge.sections ?? [], outerX, outerY);
        const jps = (edge.junctionPoints ?? []).map((p) => ({
            x: outerX + p.x,
            y: outerY + p.y,
        }));
        wireEdges.push({ path, junctionPoints: jps });
    }

    return {
        width: root.width ?? outerWidth,
        height: root.height ?? outerHeight,
        outer: {
            x: outerX,
            y: outerY,
            width: outerWidth,
            height: outerHeight,
            ports: outerPorts,
        },
        boxes,
        wireEdges,
    };
}

function boxId(name: string): string {
    return `box-${name}`;
}

function boxPortId(boxName: string, portName: string): string {
    return `box-${boxName}-port-${portName}`;
}

function outerPortId(portName: string): string {
    return `outer-port-${portName}`;
}
