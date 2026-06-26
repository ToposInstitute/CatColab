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
    function massActionEquationsData(): MassActionEquationsData {
        if (isMassActionProblemData(props.config)) {
            return props.config.equationsData;
        } else {
            return props.config;
        }
    }

    const massConservation = () => massActionEquationsData().massConservationType;
    const massConservationGranularity = () => {
        const massConversarvation = massActionEquationsData().massConservationType;
        return massConversarvation.type === "Unbalanced"
            ? massConversarvation.granularity
            : undefined;
    };

    return (
        <FormGroup compact style={{ "min-width": "286px" }}>
            <CheckboxField
                label="Conserve mass"
                checked={massConservation().type === "Balanced"}
                onChange={(evt) => {
                    props.changeConfig((content) => {
                        let massActionEquationsData: MassActionEquationsData;
                        if (isMassActionProblemData(content)) {
                            massActionEquationsData = content.equationsData;
                        } else {
                            massActionEquationsData = content;
                        }
                        if (evt.currentTarget.checked) {
                            massActionEquationsData.massConservationType = {
                                type: "Balanced",
                            };
                        } else {
                            massActionEquationsData.massConservationType = {
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
                            let massActionEquationsData: MassActionEquationsData;
                            if (isMassActionProblemData(content)) {
                                massActionEquationsData = content.equationsData;
                            } else {
                                massActionEquationsData = content;
                            }
                            if (
                                massActionEquationsData.massConservationType.type === "Unbalanced"
                            ) {
                                massActionEquationsData.massConservationType.granularity = evt
                                    .currentTarget.value as RateGranularity;
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
