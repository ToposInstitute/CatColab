import { Show } from "solid-js";

import { FormGroup, SelectField } from "catcolab-ui-components";
import type { MassActionProblemData, RateGranularity } from "catlog-wasm";

/** Configuration of a mass-action analysis. */
export type Config = MassActionProblemData;

/** Form to configure a mass-action analysis. */
export function MassActionConfigForm(props: {
    config: Config;
    changeConfig: (f: (config: Config) => void) => void;
}) {
    const massConservation = () => props.config.massConservationType;
    const massConservationGranularity = () => {
        props.config.massConservationType.type === "Unbalanced"
            ? props.config.massConservationType.granularity
            : undefined;
    };

    return (
        <FormGroup compact>
            <SelectField
                label="Mass conservation"
                value={massConservation().type}
                onChange={(evt) => {
                    props.changeConfig((content) => {
                        if (evt.currentTarget.value === "Balanced") {
                            content.massConservationType = {
                                type: "Balanced",
                            };
                        } else if (evt.currentTarget.value === "Unbalanced") {
                            content.massConservationType = {
                                type: "Unbalanced",
                                granularity: "PerTransition",
                            };
                        }
                    });
                }}
            >
                <option value={"Balanced"}>{"True"}</option>
                <option value={"Unbalanced"}>{"False"}</option>
            </SelectField>
            <Show when={massConservation().type === "Unbalanced"}>
                <SelectField
                    label="Rate granularity"
                    value={massConservationGranularity() ?? "PerTransition"}
                    onChange={(evt) => {
                        props.changeConfig((content) => {
                            if (content.massConservationType.type === "Unbalanced") {
                                content.massConservationType.granularity = evt.currentTarget
                                    .value as RateGranularity;
                            }
                        });
                    }}
                >
                    <option value={"PerTransition"}>{"Per transition"}</option>
                    <option value={"PerPlace"}>{"Per place"}</option>
                </SelectField>
            </Show>
        </FormGroup>
    );
}
