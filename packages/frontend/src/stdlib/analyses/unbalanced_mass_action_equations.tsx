import { BlockTitle, ExpandableTable, KatexDisplay } from "catcolab-ui-components";
import type { ModelAnalysisProps } from "../../analysis";
import { createModelODELatex } from "./model_ode_plot";
import type { UnbalancedMassActionEquations } from "./simulator_types";

import "./simulation.css";

/** Display the symbolic unbalanced mass-action dynamics equations for a model. */
export default function UnbalancedMassActionEquationsDisplay(
    props: ModelAnalysisProps<Record<string, never>> & {
        getEquations: UnbalancedMassActionEquations;
        title?: string;
    },
) {
    const latexEquations = createModelODELatex(
        () => props.liveModel.validatedModel(),
        (model) => props.getEquations(model),
    );

    return (
        <div class="simulation">
            <BlockTitle title={props.title} />
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
