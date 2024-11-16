import type * as Viz from "@viz-js/viz";
import { type JSX, Suspense, createResource, createSignal } from "solid-js";

import { IconButton } from "../components";
import { downloadSvg } from "./export";
import { GraphSVG } from "./graph_svg";
import { loadViz, parseGraphvizJSON, vizRenderJSON0 } from "./graphviz";
import type * as GraphvizJSON from "./graphviz_json";
import type { SVGRefProp } from "./types";

import Download from "lucide-solid/icons/download";

import "./graphviz_svg.css";

/** Visualize a graph using Graphviz and SVG.

The layout is performed by Graphviz and then the rendering is done by custom SVG
rather than Graphviz's own SVG backend.
 */
export function GraphvizSVG(props: {
    graph?: Viz.Graph;
    options?: Viz.RenderOptions;
    fallback?: JSX.Element;
}) {
    const [vizResource] = createResource(loadViz);

    const render = () => {
        const viz = vizResource();
        return viz && props.graph && vizRenderJSON0(viz, props.graph, props.options);
    };

    const [svgRef, setSvgRef] = createSignal<SVGSVGElement>();

    const exportSvg = () => {
        const svg = svgRef();
        svg && downloadSvg(svg, "visualization.svg");
    };

    return (
        <div class="graphviz-container">
            <Suspense fallback={props.fallback}>
                <GraphvizOutputSVG graph={render()} ref={setSvgRef} />
            </Suspense>
            <IconButton onClick={exportSvg} tooltip="Export Diagram" class="export-button">
                <Download size={16} />
            </IconButton>
        </div>
    );
}

function GraphvizOutputSVG(props: {
    graph?: GraphvizJSON.Graph;
    ref?: SVGRefProp;
}) {
    return (
        <div class="graphviz">
            <GraphSVG graph={props.graph && parseGraphvizJSON(props.graph)} ref={props.ref} />
        </div>
    );
}
