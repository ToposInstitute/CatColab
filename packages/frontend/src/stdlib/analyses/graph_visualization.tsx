import { type ComponentProps, createSignal, Show } from "solid-js";

import { BlockTitle } from "catcolab-ui-components";
import {
    DownloadSVGButton,
    GraphLayoutConfigForm,
    type GraphSpec,
    GraphVisualization,
} from "../../visualization";
import { defaultElkLayoutOptions, defaultGraphvizAttributes } from "../graph_styles";

import "./graph_visualization.css";

type GraphVisualizationProps = ComponentProps<typeof GraphVisualization>;

/** Component for a graph visualization analysis.

Used to visualize, for example, the generating graphs of models and diagrams.
See `ModelGraph` and `DiagramGraph`.
 */
export function GraphVisualizationAnalysis(
    props: ComponentProps<typeof GraphLayoutConfigForm> & {
        graph?: GraphSpec.Graph;
        renderer?: GraphVisualizationProps["renderer"];
        elkLayoutOptions?: GraphVisualizationProps["elkLayoutOptions"];
        graphvizAttributes?: GraphVisualizationProps["graphvizAttributes"];
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
            <BlockTitle
                title={title()}
                actions={header()}
                settingsPane={
                    <GraphLayoutConfigForm
                        config={props.config}
                        changeConfig={props.changeConfig}
                    />
                }
            />
            <div class="graph-visualization">
                <Show when={props.graph}>
                    {(graph) => (
                        <GraphVisualization
                            graph={graph()}
                            config={props.config}
                            elkLayoutOptions={props.elkLayoutOptions ?? defaultElkLayoutOptions}
                            graphvizAttributes={
                                props.graphvizAttributes ?? defaultGraphvizAttributes
                            }
                            renderer={props.renderer}
                            ref={setSvgRef}
                        />
                    )}
                </Show>
            </div>
        </div>
    );
}
