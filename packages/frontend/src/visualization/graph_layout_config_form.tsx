import { Show } from "solid-js";

import { FormGroup, SelectField } from "catcolab-ui-components";
import { type Config, Direction, Engine } from "./graph_layout_config";

/** Form to configure a graph layout algorithm. */
export function GraphLayoutConfigForm(props: {
    config: Config;
    changeConfig: (f: (config: Config) => void) => void;
}) {
    return (
        <FormGroup compact>
            <SelectField
                label="Layout"
                value={props.config.layout}
                onChange={(evt) => {
                    props.changeConfig((content) => {
                        content.layout = evt.currentTarget.value as Engine;
                    });
                }}
            >
                <option value={Engine.VizDirected}>{"Directed"}</option>
                <option value={Engine.VizUndirected}>{"Undirected"}</option>
            </SelectField>
            <Show when={props.config.layout === Engine.VizDirected}>
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
        </FormGroup>
    );
}
