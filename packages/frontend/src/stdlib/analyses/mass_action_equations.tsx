import { BlockTitle, ExpandableTable, KatexDisplay } from "catcolab-ui-components";
import type { MassActionVariant } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { MassActionConfigForm } from "./mass_action_config_form";
import { createModelODELatex } from "./model_ode_plot";
import type { MassActionEquations } from "./simulator_types";

import "./simulation.css";

/** Display the symbolic mass-action dynamics equations for a model. */
export default function MassActionEquationsDisplay(
    props: ModelAnalysisProps<MassActionVariant> & {
        content: MassActionVariant;
        getEquations: MassActionEquations;
        ratesHaveGranularity: boolean;
        title?: string;
    },
) {
    const latexEquations = createModelODELatex(
        () => props.liveModel.validatedModel(),
        (model) => props.getEquations(model),
    );

    return (
        <div class="simulation">
            <BlockTitle
                title={props.title}
                settingsPane={
                    <MassActionConfigForm
                        config={props.content}
                        changeConfig={props.changeContent}
                        enableGranularity={props.ratesHaveGranularity}
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
