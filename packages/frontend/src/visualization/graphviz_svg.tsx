import type * as Viz from "@viz-js/viz";
import { type JSX, Suspense, createResource, createSignal } from "solid-js";

import { Download } from "lucide-solid";
import { IconButton } from "../components";
import { exportVisualizationSVG } from "./export_visualization";
import { GraphSVG } from "./graph_svg";
import { loadViz, parseGraphvizJSON, vizRenderJSON0 } from "./graphviz";
import type * as GraphvizJSON from "./graphviz_json";

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

    const handleExportSVG = (ref: HTMLDivElement) => {
        exportVisualizationSVG(ref);
    };

    return (
        <div class="graphviz-container">
            <Suspense fallback={props.fallback}>
                <GraphvizOutputSVG graph={render()} onExport={handleExportSVG} />
            </Suspense>
        </div>
    );
}

export function GraphvizOutputSVG(props: {
    graph?: GraphvizJSON.Graph;
    onExport?: (ref: HTMLDivElement) => void;
}) {
    const [visualizationRef, setVisualizationRef] = createSignal<HTMLDivElement | null>(null);

    const handleExport = () => {
        const ref = visualizationRef();
        if (ref) {
            props.onExport?.(ref);
        }
    };

    return (
        <div class="graphviz" ref={setVisualizationRef}>
            <GraphSVG graph={props.graph && parseGraphvizJSON(props.graph)} />
            <IconButton onClick={handleExport} tooltip="Export Diagram" class="export-button">
                <Download size={16} />
            </IconButton>
        </div>
    );
}
