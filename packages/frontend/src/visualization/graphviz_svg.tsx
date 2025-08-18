import type * as Viz from "@viz-js/viz";
import { type JSX, Suspense, createResource } from "solid-js";

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
    fallback?: JSX.Element;
    ref?: SVGRefProp;
}) {
    const [vizResource] = createResource(loadViz);

    const render = () => {
        const viz = vizResource();
        return viz && props.graph && vizRenderJSON0(viz, props.graph, props.options);
    };

    return (
        <Suspense fallback={props.fallback}>
            <GraphvizOutputSVG graph={render()} ref={props.ref} />
        </Suspense>
    );
}

function GraphvizOutputSVG(props: {
    graph?: GraphvizJSON.Graph;
    ref?: SVGRefProp;
}) {
    return <GraphSVG graph={props.graph && parseGraphvizJSON(props.graph)} ref={props.ref} />;
}
