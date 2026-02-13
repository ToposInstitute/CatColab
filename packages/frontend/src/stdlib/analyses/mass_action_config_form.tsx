import { Show } from "solid-js";

import { FormGroup, SelectField } from "catcolab-ui-components";

/** Configuration of a mass-action analysis. */
export type Config = {
    /** Whether or not mass should be conserved. */
    massConservation: Boolean;

    /** Whether or not rates should be per-transition or per-place, when applicable. */
    rateGranularity?: RateGranularity;
};

/** Rate granularity for non mass-conserving ("unbalanced") mass-action. */
export enum RateGranularity {
    PerTransition = "horizontal",
    PerPlace = "vertical",
}

/** Form to configure a mass-action analysis. */
export function MassActionConfigForm(props: {
    config: Config;
    changeConfig: (f: (config: Config) => void) => void;
}) {
    const massConservation = () => props.config.massConservation;

    return (
        <FormGroup compact>
            <SelectField
                label="Mass conservation"
                value={massConservation().toString()}
                onChange={(evt) => {
                    props.changeConfig((content) => {
                        content.massConservation = (evt.currentTarget.value === "true") ? true : false;
                    });
                }}
            >
                <option value={"true"}>{"True"}</option>
                <option value={"false"}>{"False"}</option>
            </SelectField>
            <Show when={massConservation() === false}>
                <SelectField
                    label="Rate granularity"
                    value={props.config.rateGranularity ?? RateGranularity.PerTransition}
                    onChange={(evt) => {
                        props.changeConfig((content) => {
                            content.rateGranularity = evt.currentTarget.value as RateGranularity;
                        });
                    }}
                >
                    <option value={RateGranularity.PerTransition}>{"Per transition"}</option>
                    <option value={RateGranularity.PerPlace}>{"Per place"}</option>
                </SelectField>
            </Show>
        </FormGroup>
    );
}
