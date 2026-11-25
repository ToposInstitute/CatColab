import type { ModelAnalysisBuilder, ModelAnalysisProps } from "../../analysis";
import {
    newPolynomialODEEquationsData,
    newPolynomialODEProblemData,
    type PolynomialODEEquations,
    type PolynomialODEEquationsData,
    type PolynomialODEProblemData,
    type PolynomialODESimulator,
} from "./types";

export function loadPolynomialODEAnalysis(args: {
    loadSimulator: () => Promise<PolynomialODESimulator>;
    signedContributions: boolean;
}): () => Promise<ModelAnalysisBuilder<PolynomialODEProblemData>> {
    return async () => {
        const simulate = await args.loadSimulator();
        const PolynomialODESimulation = (await import("./polynomial_ode_simulation")).default;
        return {
            contentVersion: 0,
            initialContent: newPolynomialODEProblemData,
            component: (props: ModelAnalysisProps<PolynomialODEProblemData>) => (
                <PolynomialODESimulation
                    simulate={simulate}
                    signedContributions={args.signedContributions}
                    {...props}
                />
            ),
        };
    };
}

export function loadPolynomialODEEquationsAnalysis(args: {
    loadEquations: () => Promise<PolynomialODEEquations>;
}): () => Promise<ModelAnalysisBuilder<PolynomialODEEquationsData>> {
    return async () => {
        const getEquations = await args.loadEquations();
        const PolynomialODEEquationsDisplay = (await import("./polynomial_ode_equations")).default;
        return {
            contentVersion: 0,
            initialContent: newPolynomialODEEquationsData,
            component: (props: ModelAnalysisProps<PolynomialODEEquationsData>) => (
                <PolynomialODEEquationsDisplay getEquations={getEquations} {...props} />
            ),
        };
    };
}
