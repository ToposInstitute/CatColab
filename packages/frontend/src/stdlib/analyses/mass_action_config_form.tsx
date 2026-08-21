import { Show } from "solid-js";

import { CheckboxField, FormGroup, SelectField } from "catcolab-ui-components";
import type { MassActionVariant, PetriNetMassActionProblemData } from "catlog-wasm";

/** Configuration of a mass-action analysis. Note that we need to be able to accept either an
 *  entire `PetriNetMassActionProblemData` or just a `MassActionVariant`, depending on whether we
 *  are in the simulation analysis widget or the equations one (respectively). */
export type Config = MassActionVariant | PetriNetMassActionProblemData;

function isProblemData(config: Config): config is PetriNetMassActionProblemData {
    return (config as PetriNetMassActionProblemData).variant !== undefined;
}

/** Form to configure a mass-action analysis. */
export function MassActionConfigForm(props: {
    config: Config;
    changeConfig: (f: (config: Config) => void) => void;
    enableGranularity: boolean;
}) {
    function massActionVariant(): MassActionVariant {
        if (isProblemData(props.config)) {
            return props.config.variant || "Balanced";
        } else {
            return props.config || "Balanced";
        }
    }

    const massConservationGranularity = () => {
        switch (massActionVariant()) {
            case "Balanced":
                return "PerTransition";
            case "Unbalanced":
                return "PerTransition";
            case "VeryUnbalanced":
                return "PerPlace";
        }
    };

    return (
        <FormGroup compact style={{ "min-width": "286px" }}>
            <CheckboxField
                label="Conserve mass"
                checked={massActionVariant() === "Balanced"}
                onChange={(evt) => {
                    props.changeConfig((content) => {
                        if (isProblemData(content)) {
                            if (evt.currentTarget.checked) {
                                content.variant = "Balanced";
                            } else {
                                content.variant = "Unbalanced";
                            }
                        } else {
                            if (evt.currentTarget.checked) {
                                content = "Balanced";
                            } else {
                                content = "Unbalanced";
                            }
                        }
                    });
                }}
            />
            <Show when={massActionVariant() === "Unbalanced" && props.enableGranularity}>
                <SelectField
                    label="Rate granularity"
                    value={massConservationGranularity() ?? "PerTransition"}
                    onChange={(evt) => {
                        props.changeConfig((content) => {
                            if (isProblemData(content)) {
                                switch (evt.currentTarget.value) {
                                    case "PerTransition":
                                        content.variant = "Unbalanced";
                                        break;
                                    case "PerPlace":
                                        content.variant = "VeryUnbalanced";
                                        break;
                                }
                            } else {
                                switch (evt.currentTarget.value) {
                                    case "PerTransition":
                                        content = "Unbalanced";
                                        break;
                                    case "PerPlace":
                                        content = "VeryUnbalanced";
                                        break;
                                }
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
