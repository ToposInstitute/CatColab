import { BlockTitle, ExpandableTable, KatexDisplay } from "catcolab-ui-components";
import type { PolynomialODEEquationsData } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { createModelODELatex } from "../../visualization";
import type { PolynomialODEEquations } from "./types";

import "../../visualization/simulation.css";

/** Display the symbolic mass-action dynamics equations for a model. */
export default function PolynomialODEEquationsDisplay(
    props: ModelAnalysisProps<PolynomialODEEquationsData> & {
        getEquations: PolynomialODEEquations;
    },
) {
    const latexEquations = createModelODELatex(
        () => props.liveModel.validatedModel(),
        (model) => props.getEquations(model, props.content),
    );

    return (
        <div class="simulation">
            <BlockTitle title="Polynomial ODE equations" />
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
