import { For } from "solid-js";

import * as GraphLayout from "./graph_layout";

import "./graph_svg.css";


/** Draw a graph that has a layout using SVG.
 */
export function GraphSVG<Id>(props: {
    graph: GraphLayout.Graph<Id>,
}) {
    return (
        <svg class="graph"
            width={props.graph.width} height={props.graph.height}
        >
        <defs>
            <ArrowheadMarker id="arrow" />
        </defs>
        <For each={props.graph.nodes}>
            {(node) => {
                const { pos: {x, y}, width, height } = node;
                return <>
                    <rect class="node" x={x - width/2} y={y - height/2}
                        width={width} height={height}
                    />
                    <text class="label node-label" x={x} y={y}
                        dominant-baseline="middle" text-anchor="middle"
                    >
                        {node.label}
                    </text>
                </>;
            }}
        </For>
        <For each={props.graph.edges}>
            {(edge) => {
                const { label, sourcePos, targetPos, labelPos, path } = edge;
                return <>
                    {path ?
                     <path class="edge" marker-end="url(#arrow)"
                        d={path} /> :
                     <line class="edge" marker-end="url(#arrow)"
                        x1={sourcePos.x} y1={sourcePos.y}
                        x2={targetPos.x} y2={targetPos.y} />}
                    {label &&
                     <text class="label edge-label"
                        x={labelPos?.x} y={labelPos?.y}
                        dominant-baseline="middle" text-anchor="middle"
                     >
                        {label}
                     </text>}
                </>;
            }}
        </For>
        </svg>
    );
}


/** SVG marker for an arrow head.

Source: https://developer.mozilla.org/en-US/docs/Web/SVG/Element/marker
 */
const ArrowheadMarker = (props: {
    id: string;
}) =>
    <marker id={props.id}
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" />
    </marker>;
