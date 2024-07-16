import { createResource, JSX, Show } from "solid-js";
import type * as Viz from "@viz-js/viz";

import { GraphSVG } from "./graph_svg";
import { loadViz, parseGraphvizJSON, vizRenderJSON0 } from "./graphviz";
import * as GraphvizJSON from "./graphviz_json";


/** Visualize a graph using Graphviz and SVG.

The layout is performed by Graphviz and then the rendering is done by custom SVG
rather than Graphviz's own SVG backend.
 */
export function GraphvizSVG(props: {
    graph?: Viz.Graph;
    options?: Viz.RenderOptions,
    fallback?: JSX.Element,
}) {
    const [vizResource] = createResource(loadViz);

    const render = () => {
        const viz = vizResource();
        return viz && props.graph &&
            vizRenderJSON0(viz, props.graph, props.options);
    }

    return <div class="graphviz-container">
        <Show when={vizResource.loading && props.fallback}>
            {props.fallback}
        </Show>
        <Show when={vizResource()}>
            <GraphvizOutputSVG graph={render() as GraphvizJSON.Graph} />
        </Show>
    </div>;
}

function GraphvizOutputSVG(props: {
    graph: GraphvizJSON.Graph,
}) {
    return <div class="graphviz">
        <GraphSVG graph={parseGraphvizJSON(props.graph)} />
    </div>;
}
