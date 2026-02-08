import type * as ELK from "elkjs";
import { Match, Switch } from "solid-js";

import { graphToElk } from "./elk";
import { ElkSVG } from "./elk_svg";
import { type Config, elkOptions, graphvizOptions } from "./graph_layout_config";
import type * as GraphSpec from "./graph_spec";
import { type GraphvizAttributes, graphToViz } from "./graphviz";
import { GraphvizSVG } from "./graphviz_svg";
import type { SVGRefProp } from "./types";

/** Layout and render a graph.

The main entry point for our graph visualization pipeline. It dispatches on the
layout engine, performs the layout, and renders the result as SVG.
 */
export function GraphVisualization(props: {
    graph: GraphSpec.Graph;
    config: Config;
    ref?: SVGRefProp;
    elkLayoutOptions?: ELK.LayoutOptions;
    graphvizAttributes?: GraphvizAttributes;
}) {
    const layout = () => props.config.layout;

    const elkGraph = () => {
        const layoutOptions = { ...elkOptions(props.config), ...props.elkLayoutOptions };
        return graphToElk(props.graph, layoutOptions);
    };

    return (
        <Switch>
            <Match when={layout() === "elk"}>
                <ElkSVG graph={elkGraph()} ref={props.ref} />
            </Match>
            <Match when={layout() === "graphviz-directed" || layout() === "graphviz-undirected"}>
                <GraphvizSVG
                    graph={graphToViz(props.graph, props.graphvizAttributes)}
                    options={graphvizOptions(props.config)}
                    ref={props.ref}
                />
            </Match>
        </Switch>
    );
}
