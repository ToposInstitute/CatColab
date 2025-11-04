import type * as Viz from "@viz-js/viz";
import { type ComponentProps, Show, createSignal } from "solid-js";

import { Foldable } from "../../components";
import {
    DownloadSVGButton,
    GraphLayoutConfig,
    GraphLayoutConfigForm,
    GraphvizSVG,
} from "../../visualization";

import "./graph_visualization.css";

/** Component for a graph visualization analysis.

Used to visualize, for example, the generating graphs of models and diagrams.
See `ModelGraph` and `DiagramGraph`.
 */
export function GraphVisualization(
    props: ComponentProps<typeof GraphLayoutConfigForm> & {
        graph?: Viz.Graph;
        title?: string;
    },
) {
    const [svgRef, setSvgRef] = createSignal<SVGSVGElement>();

    const title = () => props.title ?? "Visualization";
    const header = () => (
        <DownloadSVGButton
            svg={svgRef()}
            tooltip={`Export the ${title().toLowerCase()} as SVG`}
            size={16}
        />
    );

    return (
        <div class="graph-visualization-container">
            <Foldable title={title()} header={header()}>
                <GraphLayoutConfigForm config={props.config} changeConfig={props.changeConfig} />
            </Foldable>
            <div class="graph-visualization">
                <Show when={props.graph}>
                    {(graph) => (
                        <GraphvizSVG
                            graph={graph()}
                            options={GraphLayoutConfig.graphvizOptions(props.config)}
                            ref={setSvgRef}
                        />
                    )}
                </Show>
            </div>
        </div>
    );
}
