/** Analysis component for visualizing the composition pattern of a model. */

import { createSignal } from "solid-js";

import { BlockTitle, FormGroup, SelectField } from "catcolab-ui-components";
import type { ModelAnalysisProps } from "../../analysis";
import { DownloadSVGButton, ElkLayout } from "../../visualization";
import {
    type CompositionPatternConfig,
    type Direction,
    isDirection,
} from "./composition_pattern_config";
import { parseUwdElkLayout, uwdToElk } from "./undirected_wiring_diagram_elk";
import { UwdSVG } from "./undirected_wiring_diagram_svg";

import "./graph_visualization.css";

/** Visualize the composition pattern as an undirected wiring diagram (UWD) of a composite model.
 */
export default function CompositionPattern(props: ModelAnalysisProps<CompositionPatternConfig>) {
    const [svgRef, setSvgRef] = createSignal<SVGSVGElement>();

    const uwd = () => props.liveModel.elaboratedModel()?.compositionPattern();

    const direction = () => props.content.direction ?? "horizontal";

    const elkGraph = () => uwdToElk(uwd(), direction());

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
                settingsPane={
                    <DirectionForm
                        direction={direction()}
                        changeDirection={(dir) => {
                            props.changeContent((content) => {
                                content.direction = dir;
                            });
                        }}
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

/** Simple form for choosing the layout direction. */
function DirectionForm(props: { direction: Direction; changeDirection: (dir: Direction) => void }) {
    return (
        <FormGroup compact>
            <SelectField
                label="Direction"
                value={props.direction}
                onChange={(evt) => {
                    const value = evt.currentTarget.value;
                    if (isDirection(value)) {
                        props.changeDirection(value);
                    }
                }}
            >
                <option value="horizontal">{"Horizontal"}</option>
                <option value="vertical">{"Vertical"}</option>
            </SelectField>
        </FormGroup>
    );
}
