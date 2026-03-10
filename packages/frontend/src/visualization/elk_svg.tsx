import type { ELK, ElkLayoutArguments, ElkNode } from "elkjs";
import { type Accessor, type Component, createResource, type JSX, Show } from "solid-js";
import { Dynamic } from "solid-js/web";

import { loadElk, parseElkLayout } from "./elk";
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
    return (
        <ElkLayout graph={props.graph} args={props.args} elkToLayout={parseElkLayout}>
            {(graph) => (
                <Dynamic component={props.renderer ?? GraphSVG} graph={graph()} ref={props.ref} />
            )}
        </ElkLayout>
    );
}

/** Run an ELK layout and render the result.
 */
export function ElkLayout<T>(props: {
    graph?: ElkNode;
    args?: ElkLayoutArguments;
    elkToLayout: (e: ElkNode) => T;
    children: (layout: Accessor<T>) => JSX.Element;
}) {
    const [elkResource] = createResource(loadElk);

    const [layout] = createResource(
        () => {
            const elk = elkResource();
            const graph = props.graph;
            if (elk && graph) {
                return [elk, graph] as const;
            }
        },
        async ([elk, graph]: readonly [ELK, ElkNode]): Promise<T> => {
            const elkNode = await elk.layout(graph, props.args);
            return props.elkToLayout(elkNode);
        },
    );

    return <Show when={layout()}>{(l) => props.children(l)}</Show>;
}
