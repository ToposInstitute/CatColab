import { BlockTitle, ExpandableTable, KatexDisplay } from "catcolab-ui-components";
import { LCCEquationsData } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { createModelODELatex } from "./model_ode_plot";
import type { LCCEquations } from "./simulator_types";

import "./simulation.css";

/** Display the symbolic mass-action dynamics equations for a model. */
export default function LCCEquationsDisplay(
    props: ModelAnalysisProps<LCCEquationsData> & {
        content: LCCEquationsData;
        getEquations: LCCEquations;
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
