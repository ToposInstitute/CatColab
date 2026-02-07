import type { ElkLayoutArguments, ElkNode } from "elkjs";
import { createResource, Show } from "solid-js";

import { elkLayoutGraph, loadElk } from "./elk";
import { GraphSVG } from "./graph_svg";
import type { SVGRefProp } from "./types";

/** Visualize a graph using ELK and SVG.

The layout is performed by ELK and then the rendering is done by SVG.
 */
export function ElkSVG(props: { graph?: ElkNode; args?: ElkLayoutArguments; ref?: SVGRefProp }) {
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
        <Show when={graphLayout()}>{(graph) => <GraphSVG graph={graph()} ref={props.ref} />}</Show>
    );
}
