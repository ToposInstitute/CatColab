import { destructure } from "@solid-primitives/destructure";
import { type Component, For, Index, Match, Show, Switch } from "solid-js";
import { Dynamic } from "solid-js/web";

import type * as GraphLayout from "./graph_layout";
import type { ArrowStyle, SVGRefProp } from "./types";

import "./graph_svg.css";

/** Draw a graph with a layout using SVG.
 */
export function GraphSVG<Id>(props: {
    graph?: GraphLayout.Graph<Id>;
    ref?: SVGRefProp;
}) {
    const edgeMarkers = () => {
        const markers = new Set<ArrowMarker>();
        for (const edge of props.graph?.edges ?? []) {
            markers.add(styleToMarker[edge.style ?? "default"]);
        }
        return Array.from(markers);
    };

    return (
        <svg ref={props.ref} class="graph" width={props.graph?.width} height={props.graph?.height}>
            <defs>
                <Index each={edgeMarkers()}>
                    {(marker) => <Dynamic component={arrowMarkerSVG[marker()]} />}
                </Index>
            </defs>
            <For each={props.graph?.edges ?? []}>{(edge) => <EdgeSVG edge={edge} />}</For>
            <For each={props.graph?.nodes ?? []}>{(node) => <NodeSVG node={node} />}</For>
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
        <g class={`node ${props.node.cssClass ?? ""}`}>
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
    const pathId = () => `path${props.edge.id}`;
    const defaultPath = () => <path id={pathId()} marker-end={markerUrl()} d={path()} />;

    const tgtLabel = (text: string) => {
        // Place the target label offset from the target in the direction
        // orthogonal to the vector from the source to the target.
        const [srcPos, tgtPos] = [props.edge.sourcePos, props.edge.targetPos];
        const vec = { x: tgtPos.x - srcPos.x, y: tgtPos.y - srcPos.y };
        const scale = 10 / Math.sqrt(vec.x ** 2 + vec.y ** 2);
        const pos = { x: tgtPos.x - scale * vec.y, y: tgtPos.y + scale * vec.x };
        return (
            <text class="label" x={pos.x} y={pos.y} dominant-baseline="middle" text-anchor="middle">
                {text}
            </text>
        );
    };

    return (
        <g class={`edge ${props.edge.cssClass ?? ""}`}>
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
                <Match when={props.edge.style === "plusDelayed"}>
                    {defaultPath()}
                    {tgtLabel("+")}
                    <text style="dominant-baseline: central;">
                        <textPath href={`#${pathId()}`} startOffset="40%">
                            {"‖"}
                        </textPath>
                    </text>
                </Match>
                <Match when={props.edge.style === "minusDelayed"}>
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

const styleToMarker: Record<ArrowStyle, ArrowMarker> = {
    default: "vee",
    double: "double",
    flat: "flat",
    plus: "triangle",
    minus: "triangle",
    indeterminate: "triangle",
    plusDelayed: "triangle",
    minusDelayed: "triangle",
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
