import type { MorType } from "catlog-wasm";
import type { ModelAnalysisBuilder, ModelAnalysisProps } from "../../analysis";
import {
    type MassActionEquations,
    type MassActionEquationsData,
    type MassActionProblemData,
    type MassActionSimulator,
    newMassActionEquationsData,
    newMassActionProblemData,
} from "./types";

export function loadMassActionAnalysis(args: {
    loadSimulator: () => Promise<MassActionSimulator>;
    ratesHaveGranularity: boolean;
    transitionType?: MorType;
}): () => Promise<ModelAnalysisBuilder<MassActionProblemData>> {
    return async () => {
        const simulate = await args.loadSimulator();
        const MassAction = (await import("./mass_action")).default;
        return {
            contentVersion: 0,
            initialContent: newMassActionProblemData,
            component: (props: ModelAnalysisProps<MassActionProblemData>) => (
                <MassAction
                    simulate={simulate}
                    ratesHaveGranularity={args.ratesHaveGranularity}
                    transitionType={args.transitionType}
                    {...props}
                />
            ),
        };
    };
}

export function loadMassActionEquationsAnalysis(args: {
    loadEquations: () => Promise<MassActionEquations>;
    ratesHaveGranularity: boolean;
}): () => Promise<ModelAnalysisBuilder<MassActionEquationsData>> {
    return async () => {
        const getEquations = await args.loadEquations();
        const MassActionEquationsDisplay = (await import("./mass_action_equations")).default;
        return {
            contentVersion: 0,
            initialContent: newMassActionEquationsData,
            component: (props: ModelAnalysisProps<MassActionEquationsData>) => (
                <MassActionEquationsDisplay
                    getEquations={getEquations}
                    ratesHaveGranularity={args.ratesHaveGranularity}
                    {...props}
                />
            ),
        };
    };
}
