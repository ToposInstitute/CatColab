import h from "vhtml";

import type * as GraphLayout from "./graph_layout";
import { perpendicularLabelPosition } from "./label_position";
import type { ArrowStyle } from "./types";

/** Styles for the rendered graph SVG.

Ported from the frontend's `graph_svg.css`. The CSS variables used by the
frontend (`--color-foreground`/`--color-background`) are resolved to concrete
colors so the exported SVG is self-contained and renders identically outside the
app's theming context.

The frontend loads these rules from an external stylesheet; when exporting a
standalone SVG we embed them in a `<style>` element instead (see
{@link renderGraphSVG}). */
export const GRAPH_SVG_CSS = `
.graph {
    display: block;
    margin: auto;
    overflow: visible;
}

.node rect {
    fill: transparent;
}

.edge line,
.edge path {
    fill: none;
    stroke: black;
    stroke-width: 1.5;
}

.edge path.double-outer {
    stroke-width: 6;
    stroke-linecap: round;
}
.edge path.double-inner {
    stroke: white;
    stroke-width: 3.5;
    stroke-linecap: round;
}
.edge path.double-marker {
    stroke: white;
    stroke-width: 1.5;
}

#arrowhead-vee,
#arrowhead-flat,
#arrowhead-double {
    fill: none;
    stroke: black;
}

#arrowhead-flat {
    stroke-width: 2;
}
`;

/** Render a laid-out graph to a self-contained SVG string.

This reproduces the markup of the frontend's SolidJS `GraphSVG` component
(`packages/frontend/src/visualization/graph_svg.tsx`), but as a plain string
built with `vhtml`'s `h()` reviver — no DOM, no JSX, no framework runtime — so it
works under any toolchain (esbuild, tsx, Vite). The graph's stylesheet is
embedded so the export stands alone, and an XML prolog is prepended. */
export function renderGraphSVG(graph: GraphLayout.Graph): string {
    const defs = h("defs", null, ...edgeMarkers(graph).map((marker) => arrowMarkerSVG[marker]()));
    const edges = graph.edges.map((edge, i) => edgeSVG(edge, i));
    const nodes = graph.nodes.map((node) => nodeSVG(node));

    const svg = h(
        "svg",
        {
            xmlns: "http://www.w3.org/2000/svg",
            class: "graph",
            ...(graph.width !== undefined && { width: graph.width }),
            ...(graph.height !== undefined && { height: graph.height }),
        },
        // Embed the stylesheet raw so its selectors (e.g. `.edge path`) are not
        // HTML-escaped. `dangerouslySetInnerHTML` inserts the content verbatim.
        h("style", { dangerouslySetInnerHTML: { __html: GRAPH_SVG_CSS } }),
        defs,
        ...edges,
        ...nodes,
    );

    return `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
}

/** The set of arrow markers actually used by the graph's edges. */
function edgeMarkers(graph: GraphLayout.Graph): ArrowMarker[] {
    const markers = new Set<ArrowMarker>();
    for (const edge of graph.edges) {
        const marker = styleToMarker[edge.style ?? "default"];
        if (marker) {
            markers.add(marker);
        }
    }
    return Array.from(markers);
}

/** Draw a labeled rectangle, positioned by top-left corner.

A reusable SVG primitive for rendering boxes with centered labels, matching the
frontend's `LabeledRect`. */
function labeledRect(props: {
    x: number;
    y: number;
    width: number;
    height: number;
    label?: string | undefined;
    class?: string | undefined;
    labelClass?: string | undefined;
}): string {
    const children: string[] = [
        h("rect", { x: props.x, y: props.y, width: props.width, height: props.height }),
    ];
    if (props.label !== undefined) {
        children.push(
            h(
                "text",
                {
                    class: props.labelClass ?? "label",
                    x: props.x + props.width / 2,
                    y: props.y + props.height / 2,
                    "dominant-baseline": "middle",
                    "text-anchor": "middle",
                },
                props.label,
            ),
        );
    }
    return h("g", { class: props.class }, ...children);
}

/** Draw a node with a layout using SVG (matches the frontend's `NodeSVG`). */
function nodeSVG(node: GraphLayout.Node): string {
    const { x, y } = node.pos;
    const { width, height } = node;
    return labeledRect({
        x: x - width / 2,
        y: y - height / 2,
        width,
        height,
        label: node.label,
        class: node.cssClass ?? "node",
    });
}

/** Draw an edge with a layout using SVG (matches the frontend's `EdgeSVG`).

`index` provides a stable, unique id for the edge path so caesura `textPath`s can
reference it. */
function edgeSVG(edge: GraphLayout.Edge, index: number): string {
    const path = edge.path;
    const style = edge.style ?? "default";
    const marker = styleToMarker[style];
    const markerUrl = `url(#arrowhead-${marker})`;
    const pathId = `edge-path-${index}`;

    const defaultPath = () => h("path", { id: pathId, "marker-end": markerUrl, d: path });

    const tgtLabel = (text: string) => {
        // Place the target label offset from the target in the direction
        // orthogonal to the vector from the source to the target.
        const pos = perpendicularLabelPosition(edge.sourcePos, edge.targetPos);
        return h(
            "text",
            {
                class: "label",
                x: pos.x,
                y: pos.y,
                "dominant-baseline": "middle",
                "text-anchor": "middle",
            },
            text,
        );
    };

    const caesura = () =>
        h(
            "text",
            { style: "dominant-baseline: central" },
            h("textPath", { href: `#${pathId}`, startOffset: "40%" }, "‖"),
        );

    let body: string;
    switch (style) {
        case "double":
            body = [
                h("path", { class: "double-outer", d: path }),
                h("path", { class: "double-inner", d: path }),
                h("path", { class: "double-marker", "marker-end": markerUrl, d: path }),
            ].join("");
            break;
        case "plus":
            body = defaultPath() + tgtLabel("+");
            break;
        case "minus":
            body = defaultPath() + tgtLabel("-");
            break;
        case "indeterminate":
            body = defaultPath() + tgtLabel("?");
            break;
        case "plusCaesura":
            body = defaultPath() + tgtLabel("+") + caesura();
            break;
        case "minusCaesura":
            body = defaultPath() + tgtLabel("-") + caesura();
            break;
        case "scalar":
            body = defaultPath() + tgtLabel("∝");
            break;
        default:
            body = defaultPath();
            break;
    }

    const label =
        edge.label !== undefined
            ? h(
                  "text",
                  {
                      class: "label",
                      ...(edge.labelPos?.x !== undefined && { x: edge.labelPos.x }),
                      ...(edge.labelPos?.y !== undefined && { y: edge.labelPos.y }),
                      "dominant-baseline": "middle",
                      "text-anchor": "middle",
                  },
                  edge.label,
              )
            : "";

    return h("g", { class: edge.cssClass ?? "edge" }, body, label);
}

/** SVG marker for a standard V-shaped arrowhead. */
function veeMarker(id: string, offset = 0): string {
    return h(
        "marker",
        {
            id,
            viewBox: "0 0 5 10",
            refX: 5 + offset,
            refY: "5",
            markerWidth: "10",
            markerHeight: "10",
            orient: "auto-start-reverse",
        },
        h("path", { d: "M 0 2 L 5 5 L 0 8" }),
    );
}

/** SVG marker for a triangular arrow head.

Source: https://developer.mozilla.org/en-US/docs/Web/SVG/Element/marker */
function triangleMarker(id: string): string {
    return h(
        "marker",
        {
            id,
            viewBox: "0 0 10 10",
            refX: "10",
            refY: "5",
            markerWidth: "6",
            markerHeight: "6",
            orient: "auto-start-reverse",
        },
        h("path", { d: "M 0 0 L 10 5 L 0 10 z" }),
    );
}

/** SVG marker for a flat arrow head, giving a "T-shaped" arrow. */
function flatMarker(id: string): string {
    return h(
        "marker",
        {
            id,
            viewBox: "0 0 5 10",
            refX: "5",
            refY: "5",
            markerWidth: "10",
            markerHeight: "10",
            orient: "auto-start-reverse",
        },
        h("path", { d: "M 5 0 L 5 10" }),
    );
}

/** Supported markers serving as arrowheads. */
export type ArrowMarker = "vee" | "double" | "triangle" | "flat";

const styleToMarker: Record<ArrowStyle, ArrowMarker | null> = {
    default: "vee",
    double: "double",
    flat: "flat",
    unmarked: null,
    plus: "triangle",
    minus: "triangle",
    indeterminate: "triangle",
    plusCaesura: "triangle",
    minusCaesura: "triangle",
    scalar: "triangle",
};

/** SVG markers for arrow heads. */
export const arrowMarkerSVG: Record<ArrowMarker, () => string> = {
    vee: () => veeMarker("arrowhead-vee"),
    double: () => veeMarker("arrowhead-double", -2),
    triangle: () => triangleMarker("arrowhead-triangle"),
    flat: () => flatMarker("arrowhead-flat"),
};
