import { createResource, JSX, Show } from "solid-js";
import type { Graph as GraphInput, RenderOptions } from "@viz-js/viz";

import { Graph as GraphOutput } from "./graphviz_output";


/** Visualize a graph using Graphviz and SVG.

The layout is performed by Graphviz and then the rendering is done by custom SVG
instead of an Graphviz's own SVG backend.
 */
export function GraphvizSVG(props: {
    graph: GraphInput;
    options?: RenderOptions,
    fallback?: JSX.Element,
}) {
    const [vizResource] = createResource(async () => {
        const { instance } = await import("@viz-js/viz");
        const viz = await instance();
        return viz;
    });

    const render = () => {
        // We use `renderString` rather than the convenience method `renderJSON`
        // since we need only `json0` output, which is simpler than `json`.
        const options = { ...props.options, format: "json0" };
        const viz = vizResource();
        return viz && JSON.parse(viz.renderString(props.graph, options));
    }

    return <div class="graphviz-container">
        <Show when={vizResource.loading && props.fallback}>
            {props.fallback}
        </Show>
        <Show when={vizResource()}>
            <GraphvizOutputSVG graph={render() as GraphOutput} />
        </Show>
    </div>;
}

function GraphvizOutputSVG(props: {
    graph: GraphOutput,
}) {
    return <div class="graphviz">
        {JSON.stringify(props.graph)}
    </div>;
}
