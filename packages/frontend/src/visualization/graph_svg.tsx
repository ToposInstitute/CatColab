import { For, type JSX } from "solid-js";

import type * as GraphLayout from "./graph_layout";
import type { ArrowStyle } from "./types";

import "./graph_svg.css";

/** Draw a graph that has a layout using SVG.
 */
export function GraphSVG<Id>(props: {
    graph?: GraphLayout.Graph<Id>;
}) {
    const markerSet = () => {
        const markers = new Set<ArrowMarker>();
        for (const edge of props.graph?.edges ?? []) {
            markers.add(styleMarkers[edge.style ?? "default"]);
        }
        return markers;
    };

    return (
        <svg class="graph" width={props.graph?.width} height={props.graph?.height}>
            <defs>
                <For each={Array.from(markerSet())}>{(marker) => markerComponents[marker]}</For>
            </defs>
            <For each={props.graph?.edges ?? []}>
                {(edge) => {
                    const { label, labelPos, path } = edge;
                    const style = edge.style ?? "default";
                    const marker = styleMarkers[style];
                    const markerURL = `url(#arrowhead-${marker})`;
                    return (
                        <g class={`edge ${edge.cssClass ?? ""}`}>
                            {style === "double" ? (
                                <>
                                    <path class="double-outer" d={path} />
                                    <path class="double-inner" d={path} />
                                    <path class="double-marker" marker-end={markerURL} d={path} />
                                </>
                            ) : (
                                <path marker-end={markerURL} d={path} />
                            )}
                            {label && (
                                <text
                                    class="label"
                                    x={labelPos?.x}
                                    y={labelPos?.y}
                                    dominant-baseline="middle"
                                    text-anchor="middle"
                                >
                                    {label}
                                </text>
                            )}
                        </g>
                    );
                }}
            </For>
            <For each={props.graph?.nodes ?? []}>
                {(node) => {
                    const {
                        pos: { x, y },
                        width,
                        height,
                    } = node;
                    return (
                        <g class={`node ${node.cssClass ?? ""}`}>
                            <rect
                                x={x - width / 2}
                                y={y - height / 2}
                                width={width}
                                height={height}
                            />
                            <text
                                class="label"
                                x={x}
                                y={y}
                                dominant-baseline="middle"
                                text-anchor="middle"
                            >
                                {node.label}
                            </text>
                        </g>
                    );
                }}
            </For>
        </svg>
    );
}

/** SVG marker for a standard V-shaped arrowhead.
 */
const VeeMarker = (props: { id: string; offset?: number }) => (
    <marker
        id={props.id}
        viewBox="0 0 5 10"
        refX={5 + (props.offset ?? 0)}
        refY="5"
        markerWidth="10"
        markerHeight="10"
        orient="auto-start-reverse"
    >
        <path d="M 0 0 L 5 5 L 0 10" />
    </marker>
);

/** SVG marker for a triangular arrow head.

Source: https://developer.mozilla.org/en-US/docs/Web/SVG/Element/marker
 */
const TriangleMarker = (props: { id: string }) => (
    <marker
        id={props.id}
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
    >
        <path d="M 0 0 L 10 5 L 0 10 z" />
    </marker>
);

/** SVG marker for a flat arrow head, giving a "T-shaped" arrow.
 */
const FlatMarker = (props: { id: string }) => (
    <marker
        id={props.id}
        viewBox="0 0 5 10"
        refX="5"
        refY="5"
        markerWidth="10"
        markerHeight="10"
        orient="auto-start-reverse"
    >
        <path d="M 5 0 L 5 10" />
    </marker>
);

type ArrowMarker = "vee" | "double" | "triangle" | "flat";

const styleMarkers: Record<ArrowStyle, ArrowMarker> = {
    default: "vee",
    double: "double",
    flat: "flat",
};

const markerComponents: Record<ArrowMarker, JSX.Element> = {
    vee: <VeeMarker id="arrowhead-vee" />,
    double: <VeeMarker id="arrowhead-double" offset={-2} />,
    triangle: <TriangleMarker id="arrowhead-triangle" />,
    flat: <FlatMarker id="arrowhead-flat" />,
};
