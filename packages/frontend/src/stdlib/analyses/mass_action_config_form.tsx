import { Show } from "solid-js";

import { CheckboxField, FormGroup, SelectField } from "catcolab-ui-components";
import type { MassActionProblemData, RateGranularity } from "catlog-wasm";

/** Configuration of a mass-action analysis. */
export type Config = MassActionProblemData;

/** Form to configure a mass-action analysis. */
export function MassActionConfigForm(props: {
    config: Config;
    changeConfig: (f: (config: Config) => void) => void;
    enableGranularity: boolean;
}) {
    const massConservation = () => props.config.massConservationType;
    const massConservationGranularity = () => {
        props.config.massConservationType.type === "Unbalanced"
            ? props.config.massConservationType.granularity
            : undefined;
    };

    return (
        <FormGroup compact style="min-width: 286px">
            <CheckboxField
                label="Conserve mass"
                checked={massConservation().type === "Balanced"}
                onChange={(evt) => {
                    props.changeConfig((content) => {
                        if (evt.currentTarget.checked) {
                            content.massConservationType = {
                                type: "Balanced",
                            };
                        } else {
                            content.massConservationType = {
                                type: "Unbalanced",
                                granularity: "PerTransition",
                            };
                        }
                    });
                }}
            />
            <Show when={massConservation().type === "Unbalanced" && props.enableGranularity}>
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
