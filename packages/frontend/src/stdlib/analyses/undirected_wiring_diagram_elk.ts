/** Conversion of undirected wiring diagrams (UWDs) to ELK graphs and parsing
of the resulting layouts.

Boxes represent sub-models, ports represent shared interfaces, and junctions
connect ports across sub-models via undirected wires.
 */

import type { ElkExtendedEdge, ElkNode, ElkPort } from "elkjs";

import type { UWD } from "catlog-wasm";
import { sectionsToPath } from "../../visualization/elk";
import { getMainFont, measureText } from "../../visualization/font_utils";
import type { Direction } from "./composition_pattern_config";

/** Layout of an undirected wiring diagram, as computed by ELK. */
export interface UwdLayout {
    /** Width of the bounding box. */
    width: number;

    /** Height of the bounding box. */
    height: number;

    /** The outer boundary of the diagram. */
    outer: UwdOuterLayout;

    /** Laid-out boxes inside the diagram. */
    boxes: UwdBoxLayout[];

    /** Laid-out edges connecting ports via junctions (undirected wires). */
    wireEdges: UwdEdgeLayout[];
}

/** Layout of the outer boundary of a UWD. */
export interface UwdOuterLayout {
    x: number;
    y: number;
    width: number;
    height: number;
    ports: UwdPortLayout[];
}

/** Layout of a box in a UWD. */
export interface UwdBoxLayout {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    ports: UwdPortLayout[];
}

/** Layout of a port in a UWD. */
export interface UwdPortLayout {
    x: number;
    y: number;
    label: string;
    labelX: number;
    labelY: number;
}

/** Layout of an undirected wire edge. */
export interface UwdEdgeLayout {
    path: string;
    junctionPoints: { x: number; y: number }[];
}

// Size constants for ELK layout.
export const portSize = 8;
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
export function uwdToElk(uwd: UWD | undefined, direction: Direction): ElkNode {
    const elkDirection = direction === "horizontal" ? "RIGHT" : "DOWN";
    const portSide = direction === "horizontal" ? "EAST" : "SOUTH";

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

    // Build a map from junction name to the set of ELK port IDs connected to
    // it. This is used to create direct port-to-port edges instead of routing
    // through intermediate junction nodes.
    const junctionPorts = new Map<string, string[]>();
    if (uwd) {
        for (const box of uwd.boxes) {
            for (const port of box.ports) {
                if (port.junction != null) {
                    const list = junctionPorts.get(port.junction) ?? [];
                    list.push(boxPortId(box.name, port.name));
                    junctionPorts.set(port.junction, list);
                }
            }
        }
        for (const port of uwd.outerPorts) {
            if (port.junction != null) {
                const list = junctionPorts.get(port.junction) ?? [];
                list.push(outerPortId(port.name));
                junctionPorts.set(port.junction, list);
            }
        }
    }

    // Build wire edges: connect ports that share a junction directly to each
    // other, creating edges between every pair of ports in each junction group.
    const edges: ElkExtendedEdge[] = [];
    let edgeIndex = 0;

    for (const ports of junctionPorts.values()) {
        for (let i = 0; i < ports.length; i++) {
            for (let j = i + 1; j < ports.length; j++) {
                const source = ports[i];
                const target = ports[j];
                if (source && target) {
                    edges.push({
                        id: `wire-${edgeIndex++}`,
                        sources: [source],
                        targets: [target],
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

/** Parse the ELK layout result into a `UwdLayout`. */
export function parseUwdElkLayout(root: ElkNode): UwdLayout {
    const outerElk = root.children?.[0];
    if (!outerElk) {
        return emptyLayout();
    }

    const outerX = outerElk.x ?? 0;
    const outerY = outerElk.y ?? 0;
    const outerWidth = outerElk.width ?? 0;
    const outerHeight = outerElk.height ?? 0;

    // Parse outer ports.
    const outerPorts: UwdPortLayout[] = (outerElk.ports ?? []).map((port) =>
        parsePortLayout(port, outerX, outerY),
    );

    const boxes: UwdBoxLayout[] = [];

    for (const child of outerElk.children ?? []) {
        const cx = outerX + (child.x ?? 0);
        const cy = outerY + (child.y ?? 0);
        const cw = child.width ?? 0;
        const ch = child.height ?? 0;

        const childPorts: UwdPortLayout[] = (child.ports ?? []).map((port) =>
            parsePortLayout(port, cx, cy),
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
    const wireEdges: UwdEdgeLayout[] = [];

    for (const edge of outerElk.edges ?? []) {
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

/** Parse the layout of an ELK port relative to a parent offset. */
function parsePortLayout(port: ElkPort, parentX: number, parentY: number): UwdPortLayout {
    const portLabel = port.labels?.[0];
    const px = parentX + (port.x ?? 0);
    const py = parentY + (port.y ?? 0);
    return {
        x: px + (port.width ?? 0) / 2,
        y: py + (port.height ?? 0) / 2,
        label: portLabel?.text ?? "",
        labelX: px + (portLabel?.x ?? 0),
        labelY: py + (portLabel?.y ?? 0) + (portLabel?.height ?? 0) / 2,
    };
}

function emptyLayout(): UwdLayout {
    const size = 100;
    return {
        width: size,
        height: size,
        outer: { x: 0, y: 0, width: size, height: size, ports: [] },
        boxes: [],
        wireEdges: [],
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
