import { BlockTitle, ExpandableTable, KatexDisplay } from "catcolab-ui-components";
import { LotkaVolterraEquationsData } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { createModelODELatex } from "./model_ode_plot";
import type { LotkaVolterraEquations } from "./simulator_types";

import "./simulation.css";

/** Display the symbolic mass-action dynamics equations for a model. */
export default function LotkaVolterraEquationsDisplay(
    props: ModelAnalysisProps<LotkaVolterraEquationsData> & {
        content: LotkaVolterraEquationsData;
        getEquations: LotkaVolterraEquations;
        title?: string;
    },
) {
    const latexEquations = createModelODELatex(
        () => props.liveModel.validatedModel(),
        (model) => props.getEquations(model, props.content),
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
