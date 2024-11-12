import type * as Viz from "@viz-js/viz";
import { type JSX, Suspense, createResource } from "solid-js";

import { exportVisualizationSVG } from "./export_visualization";
import { GraphSVG } from "./graph_svg";
import { loadViz, parseGraphvizJSON, vizRenderJSON0 } from "./graphviz";
import type * as GraphvizJSON from "./graphviz_json";

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

    return (
        <div class="graphviz-container">
            <Suspense fallback={props.fallback}>
                <GraphvizOutputSVG graph={render()} />
            </Suspense>
        </div>
    );
}

function GraphvizOutputSVG(props: {
    graph?: GraphvizJSON.Graph;
}) {
    return (
        <div class="graphviz" ref={visualizationRef}>
            <GraphSVG graph={props.graph && parseGraphvizJSON(props.graph)} />
        </div>
    );
}

// Create a ref for the visualization container
let visualizationRef: HTMLDivElement | undefined;

// export handling
export const handleExportSVG = () => {
    if (visualizationRef) {
        exportVisualizationSVG(visualizationRef);
    }
};
