import type * as Viz from "@viz-js/viz";
import { type JSX, Suspense, createResource, createSignal, createEffect } from "solid-js";

import { GraphSVG } from "./graph_svg";
import { loadViz, parseGraphvizJSON, vizRenderJSON0 } from "./graphviz";
import type * as GraphvizJSON from "./graphviz_json";
import { exportVisualizationSVG } from "./export_visualization";

export function GraphvizSVG(props: {
    graph?: Viz.Graph;
    options?: Viz.RenderOptions;
    fallback?: JSX.Element;
}) {
    const [vizResource] = createResource(loadViz);
    const [graphvizExists, setGraphvizExists] = createSignal(false);
    let visualizationRef: HTMLDivElement | undefined;

    const render = () => {
        const viz = vizResource();
        return viz && props.graph && vizRenderJSON0(viz, props.graph, props.options);
    };

    // Effect to check if the graphviz element exists
    createEffect(() => {
        if (visualizationRef) {
            setGraphvizExists(!!visualizationRef.querySelector('.graphviz'));
        }
    });

    const handleExportSVG = () => {
        if (visualizationRef) {
            exportVisualizationSVG(visualizationRef);
        }
    };

    return (
        <div class="graphviz-container" ref={visualizationRef}>
            <Suspense fallback={props.fallback}>
                <GraphvizOutputSVG graph={render()} />
            </Suspense>
            <button class="export-button"
                onClick={handleExportSVG} 
                disabled={graphvizExists()}
            >
                Export SVG
            </button>
        </div>
    );
}

function GraphvizOutputSVG(props: {
    graph?: GraphvizJSON.Graph;
}) {
    return (
        <div class="graphviz">
            <GraphSVG graph={props.graph && parseGraphvizJSON(props.graph)} />
        </div>
    );
}