import { Show } from "solid-js";

import { FormGroup, InputField, SelectField } from "catcolab-ui-components";
import { type Config, Direction, Engine, Overlap } from "./graph_layout_config";

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
                    value={props.config.overlap ?? Overlap.False}
                    onChange={(evt) => {
                        props.changeConfig((content) => {
                            content.overlap = evt.currentTarget.value as Overlap;
                        });
                    }}
                >
                    <option value={Overlap.False}>{"Remove overlaps"}</option>
                    <option value={Overlap.Scale}>{"Scale uniformly"}</option>
                    <option value={Overlap.ScaleXY}>{"Scale independently"}</option>
                    <option value={Overlap.True}>{"Allow overlaps"}</option>
                    <option value={Overlap.Prism}>{"Prism algorithm"}</option>
                </SelectField>
                <Show when={(props.config.overlap ?? Overlap.False) !== Overlap.True}>
                    <InputField
                        label="Separation"
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        value={props.config.sep ?? 1.0}
                        onInput={(evt) => {
                            props.changeConfig((content) => {
                                const value = evt.currentTarget.value;
                                content.sep = value === "" ? 1.0 : Number.parseFloat(value);
                            });
                        }}
                    />
                </Show>
            </Show>
        </FormGroup>
    );
}
