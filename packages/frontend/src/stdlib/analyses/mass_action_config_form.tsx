import { Show } from "solid-js";

import { CheckboxField, FormGroup, SelectField } from "catcolab-ui-components";
import type { MassActionEquationsData, MassActionProblemData, RateGranularity } from "catlog-wasm";

/** Configuration of a mass-action analysis. */
export type Config = MassActionEquationsData | MassActionProblemData;

function isMassActionProblemData(config: Config): config is MassActionProblemData {
    return (config as MassActionProblemData).equationsData !== undefined;
}

/** Form to configure a mass-action analysis. */
export function MassActionConfigForm(props: {
    config: Config;
    changeConfig: (f: (config: Config) => void) => void;
    enableGranularity: boolean;
}) {
    let correctConfig: MassActionEquationsData;
    if (isMassActionProblemData(props.config)) {
        correctConfig = props.config.equationsData;
    } else {
        correctConfig = props.config;
    }

    const massConservation = () => correctConfig.massConservationType;
    const massConservationGranularity = () =>
        correctConfig.massConservationType.type === "Unbalanced"
            ? correctConfig.massConservationType.granularity
            : undefined;

    return (
        <FormGroup compact style={{ "min-width": "286px" }}>
            <CheckboxField
                label="Conserve mass"
                checked={massConservation().type === "Balanced"}
                onChange={(evt) => {
                    props.changeConfig((content) => {
                        let correctConfig: MassActionEquationsData;
                        if (isMassActionProblemData(content)) {
                            correctConfig = content.equationsData;
                        } else {
                            correctConfig = content;
                        }
                        if (evt.currentTarget.checked) {
                            correctConfig.massConservationType = {
                                type: "Balanced",
                            };
                        } else {
                            correctConfig.massConservationType = {
                                type: "Unbalanced",
                                granularity: "PerPlace",
                            };
                        }
                    });
                }}
            />
            <Show when={massConservation().type === "Unbalanced" && props.enableGranularity}>
                <SelectField
                    label="Rate granularity"
                    value={massConservationGranularity() ?? "PerPlace"}
                    onChange={(evt) => {
                        props.changeConfig((content) => {
                            let correctConfig: MassActionEquationsData;
                            if (isMassActionProblemData(content)) {
                                correctConfig = content.equationsData;
                            } else {
                                correctConfig = content;
                            }
                            if (correctConfig.massConservationType.type === "Unbalanced") {
                                correctConfig.massConservationType.granularity = evt.currentTarget
                                    .value as RateGranularity;
                            }
                        });
                    }}
                >
                    <option value={"PerTransition"}>{"Per flow"}</option>
                    <option value={"PerPlace"}>{"Per stock"}</option>
                </SelectField>
            </Show>
        </FormGroup>
    );
}
