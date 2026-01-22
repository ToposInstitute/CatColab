import { BlockTitle, ExpandableTable, KatexDisplay } from "catcolab-ui-components";
import type { ModelAnalysisProps } from "../../analysis";
import { createModelODELatex } from "./model_ode_plot";
import type { MassActionEquations } from "./simulator_types";

import "./simulation.css";

/** Display the symbolic mass-action dynamics equations for a model. */
export default function MassActionEquationsDisplay(
    props: ModelAnalysisProps<Record<string, never>> & {
        getEquations: MassActionEquations;
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
                    { cell: (row) => <KatexDisplay math={row[0] ?? ""} /> },
                    { cell: (row) => <KatexDisplay math={row[1] ?? ""} /> },
                    { cell: (row) => <KatexDisplay math={row[2] ?? ""} /> },
                ]}
            />
        </div>
    );
}
