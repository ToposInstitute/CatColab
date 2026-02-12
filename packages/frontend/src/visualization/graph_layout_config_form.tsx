import { Show } from "solid-js";

import { FormGroup, InputField, SelectField } from "catcolab-ui-components";
import { type Config, Direction, Engine } from "./graph_layout_config";

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
                <InputField
                    label="Separation"
                    type="number"
                    min="0"
                    step="0.1"
                    value={props.config.sep ?? ""}
                    placeholder="default"
                    onInput={(evt) => {
                        props.changeConfig((content) => {
                            const value = evt.currentTarget.value;
                            content.sep = value === "" ? undefined : Number.parseFloat(value);
                        });
                    }}
                />
                <InputField
                    label="Overlap"
                    type="text"
                    value={props.config.overlap ?? ""}
                    placeholder="default"
                    onInput={(evt) => {
                        props.changeConfig((content) => {
                            const value = evt.currentTarget.value.trim();
                            content.overlap = value === "" ? undefined : value;
                        });
                    }}
                />
            </Show>
        </FormGroup>
    );
}
