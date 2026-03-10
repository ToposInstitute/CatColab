/** SVG renderer for undirected wiring diagram layouts. */

import { For } from "solid-js";

import { LabeledRect, type SVGRefProp } from "../../visualization";
import styles from "./undirected_wiring_diagram.module.css";
import type {
    UwdBoxLayout,
    UwdEdgeLayout,
    UwdLayout,
    UwdPortLayout,
} from "./undirected_wiring_diagram_elk";
import { portSize } from "./undirected_wiring_diagram_elk";

const portHalf = portSize / 2;

/** Render a UWD layout as an SVG. */
export function UwdSVG(props: { layout: UwdLayout; ref?: SVGRefProp }) {
    return (
        <svg
            ref={props.ref}
            class={styles.root}
            width={props.layout.width}
            height={props.layout.height}
        >
            {/* Outer boundary */}
            <rect
                class={styles.outer}
                x={props.layout.outer.x}
                y={props.layout.outer.y}
                width={props.layout.outer.width}
                height={props.layout.outer.height}
            />

            {/* Wire edges (undirected, drawn behind nodes) */}
            <For each={props.layout.wireEdges}>{(edge) => <UwdWireEdgeSVG edge={edge} />}</For>

            {/* Boxes */}
            <For each={props.layout.boxes}>{(box) => <UwdBoxSVG box={box} />}</For>

            {/* Outer ports */}
            <For each={props.layout.outer.ports}>{(port) => <UwdPortSVG port={port} />}</For>
        </svg>
    );
}

function UwdBoxSVG(props: { box: UwdBoxLayout }) {
    return (
        <LabeledRect
            x={props.box.x}
            y={props.box.y}
            width={props.box.width}
            height={props.box.height}
            label={props.box.label}
            class={styles.box}
            labelClass={styles.boxLabel}
        >
            <For each={props.box.ports}>{(port) => <UwdPortSVG port={port} />}</For>
        </LabeledRect>
    );
}

/** Port rendered as a small square with label positioned by ELK. */
function UwdPortSVG(props: { port: UwdPortLayout }) {
    return (
        <g class={styles.port}>
            <rect
                x={props.port.x - portHalf}
                y={props.port.y - portHalf}
                width={portHalf * 2}
                height={portHalf * 2}
            />
            <text
                class={styles.portLabel}
                x={props.port.labelX}
                y={props.port.labelY}
                dominant-baseline="middle"
            >
                {props.port.label}
            </text>
        </g>
    );
}

/** Undirected wire edge (no arrowhead), with junction dots where edges merge. */
function UwdWireEdgeSVG(props: { edge: UwdEdgeLayout }) {
    return (
        <g>
            <path class={styles.wireEdge} d={props.edge.path} />
            <For each={props.edge.junctionPoints}>
                {(pt) => <circle class={styles.junction} cx={pt.x} cy={pt.y} r={4} />}
            </For>
        </g>
    );
}
