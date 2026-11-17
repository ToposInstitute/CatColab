import type { ModelAnalysisBuilder, ModelAnalysisProps } from "../../analysis";
import {
    type LinearODEProblemData,
    type LinearODESimulator,
    newLinearODEProblemData,
} from "./types";

export function loadLinearODEAnalysis(args: {
    loadSimulator: () => Promise<LinearODESimulator>;
}): () => Promise<ModelAnalysisBuilder<LinearODEProblemData>> {
    return async () => {
        const simulate = await args.loadSimulator();
        const LinearODE = (await import("./linear_ode")).default;
        return {
            contentVersion: 0,
            initialContent: newLinearODEProblemData,
            component: (props: ModelAnalysisProps<LinearODEProblemData>) => (
                <LinearODE simulate={simulate} {...props} />
            ),
        };
    };
}
