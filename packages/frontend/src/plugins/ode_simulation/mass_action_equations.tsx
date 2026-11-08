import { BlockTitle, ExpandableTable, KatexDisplay } from "catcolab-ui-components";
import type { MassActionEquationsData } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { createModelODELatex } from "../../visualization";
import { MassActionConfigForm } from "./mass_action_config_form";
import type { MassActionEquations } from "./types";

import "../../visualization/simulation.css";

/** Display the symbolic mass-action dynamics equations for a model. */
export default function MassActionEquationsDisplay(
    props: ModelAnalysisProps<MassActionEquationsData> & {
        getEquations: MassActionEquations;
        ratesHaveGranularity: boolean;
    },
) {
    const latexEquations = createModelODELatex(
        () => props.liveModel.validatedModel(),
        (model) => props.getEquations(model, props.content),
    );

    return (
        <div class="simulation">
            <BlockTitle
                title="Mass-action dynamics equations"
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
