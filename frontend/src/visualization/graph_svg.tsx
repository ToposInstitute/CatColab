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
                const { label, sourcePos, targetPos, labelPos } = edge;
                return <>
                    <line class="edge"
                        x1={sourcePos.x} y1={sourcePos.y}
                        x2={targetPos.x} y2={targetPos.y} />
                    label &&
                    <text class="label edge-label"
                        x={labelPos?.x} y={labelPos?.y}
                        dominant-baseline="middle" text-anchor="middle"
                    >
                        {label}
                    </text>
                </>;
            }}
        </For>
        </svg>
    );
}
