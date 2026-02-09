import type { ElkLayoutArguments, ElkNode } from "elkjs";
import { type Component, createResource, Show } from "solid-js";
import { Dynamic } from "solid-js/web";

import { elkLayoutGraph, loadElk } from "./elk";
import type * as GraphLayout from "./graph_layout";
import { GraphSVG } from "./graph_svg";
import type { SVGRefProp } from "./types";

/** Visualize a graph using ELK and SVG.

The layout is performed by ELK and then the rendering is done by SVG.
 */
export function ElkSVG(props: {
    graph?: ElkNode;
    args?: ElkLayoutArguments;
    renderer?: Component<{ graph: GraphLayout.Graph; ref?: SVGRefProp }>;
    ref?: SVGRefProp;
}) {
    const [elkResource] = createResource(loadElk);

    const [graphLayout] = createResource(
        () => {
            const elk = elkResource();
            if (elk && props.graph) {
                return [elk, props.graph] as const;
            }
        },
        ([elk, graph]) => elkLayoutGraph(elk, graph, props.args),
    );

    return (
        <Show when={graphLayout()}>
            {(graph) => (
                <Dynamic component={props.renderer ?? GraphSVG} graph={graph()} ref={props.ref} />
            )}
        </Show>
    );
}
