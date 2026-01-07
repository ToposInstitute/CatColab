import { destructure } from "@solid-primitives/destructure";
import { type Component, createUniqueId, For, Index, Match, Show, Switch } from "solid-js";
import { Dynamic } from "solid-js/web";

import type * as GraphLayout from "./graph_layout";
import { perpendicularLabelPosition } from "./label_position";
import type { ArrowStyle, SVGRefProp } from "./types";

import "./graph_svg.css";

/** Draw a graph with a layout using SVG.
 */
export function GraphSVG<Id>(props: { graph: GraphLayout.Graph<Id>; ref?: SVGRefProp }) {
    const edgeMarkers = () => {
        const markers = new Set<ArrowMarker>();
        for (const edge of props.graph.edges) {
            const marker = styleToMarker[edge.style ?? "default"];
            if (marker) {
                markers.add(marker);
            }
        }
        return Array.from(markers);
    };

    return (
        <svg ref={props.ref} class="graph" width={props.graph.width} height={props.graph.height}>
            <defs>
                <Index each={edgeMarkers()}>
                    {(marker) => <Dynamic component={arrowMarkerSVG[marker()]} />}
                </Index>
            </defs>
            <For each={props.graph.edges}>{(edge) => <EdgeSVG edge={edge} />}</For>
            <For each={props.graph.nodes}>{(node) => <NodeSVG node={node} />}</For>
        </svg>
    );
}

/** Draw a node with a layout using SVG.
 */
export function NodeSVG<Id>(props: { node: GraphLayout.Node<Id> }) {
    const {
        node: {
            pos: { x, y },
            width,
            height,
        },
    } = destructure(props, { deep: true });

    return (
        <g class={props.node.cssClass ?? "node"}>
            <rect x={x() - width() / 2} y={y() - height() / 2} width={width()} height={height()} />
            <Show when={props.node.label}>
                <text class="label" x={x()} y={y()} dominant-baseline="middle" text-anchor="middle">
                    {props.node.label}
                </text>
            </Show>
        </g>
    );
}

/** Draw an edge with a layout using SVG.
 */
export function EdgeSVG<Id>(props: { edge: GraphLayout.Edge<Id> }) {
    const {
        edge: { path },
    } = destructure(props, { deep: true });

    const markerUrl = () => {
        const style = props.edge.style ?? "default";
        const marker = styleToMarker[style];
        return `url(#arrowhead-${marker})`;
    };

    const componentId = createUniqueId();
    const pathId = () => `edge-path-${componentId}`;
    const defaultPath = () => <path id={pathId()} marker-end={markerUrl()} d={path()} />;

    const tgtLabel = (text: string) => {
        // Place the target label offset from the target in the direction
        // orthogonal to the vector from the source to the target.
        const pos = perpendicularLabelPosition(props.edge.sourcePos, props.edge.targetPos);
        return (
            <text class="label" x={pos.x} y={pos.y} dominant-baseline="middle" text-anchor="middle">
                {text}
            </text>
        );
    };

    return (
        <g class={props.edge.cssClass ?? "edge"}>
            <Switch fallback={defaultPath()}>
                <Match when={props.edge.style === "double"}>
                    <path class="double-outer" d={path()} />
                    <path class="double-inner" d={path()} />
                    <path class="double-marker" marker-end={markerUrl()} d={path()} />
                </Match>
                <Match when={props.edge.style === "plus"}>
                    {defaultPath()}
                    {tgtLabel("+")}
                </Match>
                <Match when={props.edge.style === "minus"}>
                    {defaultPath()}
                    {tgtLabel("-")}
                </Match>
                <Match when={props.edge.style === "indeterminate"}>
                    {defaultPath()}
                    {tgtLabel("?")}
                </Match>
                <Match when={props.edge.style === "plusCaesura"}>
                    {defaultPath()}
                    {tgtLabel("+")}
                    <text style="dominant-baseline: central;">
                        <textPath href={`#${pathId()}`} startOffset="40%">
                            {"‖"}
                        </textPath>
                    </text>
                </Match>
                <Match when={props.edge.style === "minusCaesura"}>
                    {defaultPath()}
                    {tgtLabel("-")}
                    <text style="dominant-baseline: central;">
                        <textPath href={`#${pathId()}`} startOffset="40%">
                            {"‖"}
                        </textPath>
                    </text>
                </Match>
                <Match when={props.edge.style === "scalar"}>
                    {defaultPath()}
                    {tgtLabel("∝")}
                </Match>
            </Switch>
            <Show when={props.edge.label}>
                <text
                    class="label"
                    x={props.edge.labelPos?.x}
                    y={props.edge.labelPos?.y}
                    dominant-baseline="middle"
                    text-anchor="middle"
                >
                    {props.edge.label}
                </text>
            </Show>
        </g>
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

/** Supported markers serving as arrowheads.
 */
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

/** SVG markers for arrow heads.
 */
export const arrowMarkerSVG: Record<ArrowMarker, Component> = {
    vee: () => <VeeMarker id="arrowhead-vee" />,
    double: () => <VeeMarker id="arrowhead-double" offset={-2} />,
    triangle: () => <TriangleMarker id="arrowhead-triangle" />,
    flat: () => <FlatMarker id="arrowhead-flat" />,
};
