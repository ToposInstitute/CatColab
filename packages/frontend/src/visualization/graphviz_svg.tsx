import type * as Viz from "@viz-js/viz";
import { Show, createResource } from "solid-js";

import { GraphSVG } from "./graph_svg";
import { loadViz, parseGraphvizJSON, vizRenderJSON0 } from "./graphviz";
import type * as GraphvizJSON from "./graphviz_json";
import type { SVGRefProp } from "./types";

/** Visualize a graph using Graphviz and SVG.

The layout is performed by Graphviz and then the rendering is done by custom SVG
rather than Graphviz's own SVG backend.
 */
export function GraphvizSVG(props: {
    graph?: Viz.Graph;
    options?: Viz.RenderOptions;
    ref?: SVGRefProp;
}) {
    const [vizResource] = createResource(loadViz);

    const render = () => {
        console.log("graph for graphviz");
        console.log(props.graph);
        const viz = vizResource();
        viz &&
            props.graph &&
            console.log(
                viz.renderString(props.graph, { ...props.options, format: "dot", yInvert: true }),
            );
        return viz && props.graph && vizRenderJSON0(viz, props.graph, props.options);
    };

    return <GraphvizOutputSVG graph={render()} ref={props.ref} />;
}

function GraphvizOutputSVG(props: {
    graph?: GraphvizJSON.Graph;
    ref?: SVGRefProp;
}) {
    return (
        <Show when={props.graph}>
            {(graph) => <GraphSVG graph={parseGraphvizJSON(graph())} ref={props.ref} />}
        </Show>
    );
}
