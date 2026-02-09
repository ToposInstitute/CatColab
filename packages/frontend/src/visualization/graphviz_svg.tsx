import type * as Viz from "@viz-js/viz";
import { type Component, createResource, Show } from "solid-js";
import { Dynamic } from "solid-js/web";

import type * as GraphLayout from "./graph_layout";
import { GraphSVG } from "./graph_svg";
import { loadViz, parseGraphvizJSON, vizRenderJSON0 } from "./graphviz";
import type { SVGRefProp } from "./types";

/** Visualize a graph using Graphviz and SVG.

The layout is performed by Graphviz and then the rendering is done by custom SVG
rather than Graphviz's own SVG backend.
 */
export function GraphvizSVG(props: {
    graph?: Viz.Graph;
    options?: Viz.RenderOptions;
    renderer?: Component<{ graph: GraphLayout.Graph; ref?: SVGRefProp }>;
    ref?: SVGRefProp;
}) {
    const [vizResource] = createResource(loadViz);

    const vizJSON = () => {
        const viz = vizResource();
        return viz && props.graph && vizRenderJSON0(viz, props.graph, props.options);
    };

    return (
        <Show when={vizJSON()}>
            {(result) => (
                <Dynamic
                    component={props.renderer ?? GraphSVG}
                    graph={parseGraphvizJSON(result())}
                    ref={props.ref}
                />
            )}
        </Show>
    );
}
