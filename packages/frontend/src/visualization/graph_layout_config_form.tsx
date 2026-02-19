import { Show } from "solid-js";

import { FormGroup, InputField, SelectField } from "catcolab-ui-components";
import { type Config, Direction, Engine, OverlapRemoval } from "./graph_layout_config";

/** Form to configure a graph layout algorithm. */
export function GraphLayoutConfigForm(props: {
    config: Config;
    changeConfig: (f: (config: Config) => void) => void;
}) {
    const layout = () => props.config.layout;

    return (
        <FormGroup compact>
            <SelectField
                label="Layout"
                value={layout()}
                onChange={(evt) => {
                    props.changeConfig((content) => {
                        content.layout = evt.currentTarget.value as Engine;
                    });
                }}
            >
                <option value={Engine.VizDirected}>{"Graphviz (directed)"}</option>
                <option value={Engine.VizUndirected}>{"Graphviz (undirected)"}</option>
                <option value={Engine.Elk}>{"ELK"}</option>
            </SelectField>
            <Show when={layout() === Engine.VizDirected || layout() === Engine.Elk}>
                <SelectField
                    label="Direction"
                    value={props.config.direction ?? Direction.Vertical}
                    onChange={(evt) => {
                        props.changeConfig((content) => {
                            content.direction = evt.currentTarget.value as Direction;
                        });
                    }}
                >
                    <option value={Direction.Horizontal}>{"Horizontal"}</option>
                    <option value={Direction.Vertical}>{"Vertical"}</option>
                </SelectField>
            </Show>
            <Show when={layout() === Engine.VizUndirected}>
                <SelectField
                    label="Overlap"
                    value={props.config.overlap ?? OverlapRemoval.Prism}
                    onChange={(evt) => {
                        props.changeConfig((content) => {
                            content.overlap = evt.currentTarget.value as OverlapRemoval;
                        });
                    }}
                >
                    <option value={OverlapRemoval.Prism}>{"Prism (default)"}</option>
                    <option value={OverlapRemoval.Scale}>{"Scale uniformly"}</option>
                    <option value={OverlapRemoval.ScaleXY}>{"Scale independently"}</option>
                    <option value={OverlapRemoval.OrthoXY}>{"Orthogonalize"}</option>
                    <option value={OverlapRemoval.None}>{"No removal"}</option>
                </SelectField>
                <Show when={(props.config.overlap ?? OverlapRemoval.Prism) !== OverlapRemoval.None}>
                    <InputField
                        label="Separation"
                        type="text"
                        placeholder="0.25"
                        value={props.config.sep ?? "0.25"}
                        onInput={(evt) => {
                            props.changeConfig((content) => {
                                content.sep = evt.currentTarget.value;
                            });
                        }}
                    />
                </Show>
            </Show>
        </FormGroup>
    );
}
