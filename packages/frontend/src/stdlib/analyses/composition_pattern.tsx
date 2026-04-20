/** Analysis component for visualizing the composition pattern of a model. */

import { createSignal } from "solid-js";

import { BlockTitle } from "catcolab-ui-components";
import type { ModelAnalysisProps } from "../../analysis";
import { DownloadSVGButton, ElkLayout } from "../../visualization";
import { parseUwdElkLayout, uwdToElk } from "../../visualization/undirected_wiring_diagram_elk";
import { UwdSVG } from "../../visualization/undirected_wiring_diagram_svg";
import type { CompositionPatternConfig } from "./composition_pattern_config";

import "./graph_visualization.css";

/** Visualize the composition pattern as an undirected wiring diagram (UWD) of a composite model.
 */
export default function CompositionPattern(props: ModelAnalysisProps<CompositionPatternConfig>) {
    const [svgRef, setSvgRef] = createSignal<SVGSVGElement>();

    const uwd = () => props.liveModel.elaboratedModel()?.compositionPattern();

    const elkGraph = () => uwdToElk(uwd());

    return (
        <div class="graph-visualization-container">
            <BlockTitle
                title="Composition pattern"
                actions={
                    <DownloadSVGButton
                        svg={svgRef()}
                        tooltip="Export the composition pattern as an SVG"
                        size={16}
                    />
                }
            />
            <div class="graph-visualization">
                <ElkLayout graph={elkGraph()} elkToLayout={parseUwdElkLayout}>
                    {(layout) => <UwdSVG layout={layout()} ref={setSvgRef} />}
                </ElkLayout>
            </div>
        </div>
    );
}
