import { Show } from "solid-js";

import { FormGroup, SelectField } from "catcolab-ui-components";
import type { MassActionVariant, MassActionProblemData } from "catlog-wasm";

/** Form to configure a mass-action analysis. */
export function MassActionConfigForm(props: {
    config: MassActionProblemData;
    changeConfig: (f: (config: MassActionProblemData) => void) => void;
    enableGranularity: boolean;
}) {
    function massActionVariant(): MassActionVariant {
        return props.config.variant || "Balanced";
    }

    return (
        <FormGroup compact style={{ "min-width": "286px" }}>
            <SelectField
                label="Rate granularity"
                value={massActionVariant()}
                onChange={(evt) => {
                    props.changeConfig((content) => {
                        content.variant = evt.currentTarget.value as MassActionVariant;
                    });
                }}
            >
                <option value="Balanced">Mass-conserving</option>
                <option value="Unbalanced">Per flow</option>
                <Show when={props.enableGranularity}>
                    <option value="PerPlace">Per place</option>
                </Show>
            </SelectField>
        </FormGroup>
    );
}
