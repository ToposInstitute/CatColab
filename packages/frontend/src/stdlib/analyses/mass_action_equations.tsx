import { BlockTitle, ExpandableTable, KatexDisplay } from "catcolab-ui-components";
import type { MassActionEquationsData } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { MassActionConfigForm } from "./mass_action_config_form";
import { createModelODELatex } from "./model_ode_plot";
import type { MassActionEquations } from "./simulator_types";

import "./simulation.css";

/** Display the symbolic mass-action dynamics equations for a model. */
export default function MassActionEquationsDisplay(
    props: ModelAnalysisProps<MassActionEquationsData> & {
        getEquations: MassActionEquations;
        title?: string;
        content: MassActionEquationsData;
    },
) {
    const latexEquations = createModelODELatex(
        () => props.liveModel.validatedModel(),
        (model) => props.getEquations(model, props.content),
    );

    // The option to change RateGranularity should only be visible when working
    // with models in a theory that supports multiple inputs/outputs to morphisms
    // e.g. Petri nets but not stock-flow.
    const theoryWithGranularity = () => props.liveModel.theory()?.id === "petri-net";

    return (
        <div class="simulation">
            <BlockTitle
                title={props.title}
                settingsPane={
                    <MassActionConfigForm
                        config={props.content}
                        changeConfig={props.changeContent}
                        enableGranularity={theoryWithGranularity()}
                    />
                }
            />
            <ExpandableTable
                rows={latexEquations() ?? []}
                threshold={20}
                columns={[
                    { cell: (row) => <KatexDisplay math={row.lhs} /> },
                    { cell: () => <KatexDisplay math="=" /> },
                    { cell: (row) => <KatexDisplay math={row.rhs} /> },
                ]}
            />
        </div>
    );
}
