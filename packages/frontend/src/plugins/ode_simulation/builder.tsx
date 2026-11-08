import type { MorType } from "catlog-wasm";
import type { ModelAnalysisBuilder, ModelAnalysisProps } from "../../analysis";
import * as types from "./types";

export function loadLinearODEAnalysis(args: {
    loadSimulator: () => Promise<types.LinearODESimulator>;
}): () => Promise<ModelAnalysisBuilder<types.LinearODEProblemData>> {
    return async () => {
        const simulate = await args.loadSimulator();
        const LinearODE = (await import("./linear_ode")).default;
        return {
            contentVersion: 0,
            initialContent: types.newLinearODEProblemData,
            component: (props: ModelAnalysisProps<types.LinearODEProblemData>) => (
                <LinearODE simulate={simulate} {...props} />
            ),
        };
    };
}

export function loadLotkaVolterraAnalysis(args: {
    loadSimulator: () => Promise<types.LotkaVolterraSimulator>;
}): () => Promise<ModelAnalysisBuilder<types.LotkaVolterraProblemData>> {
    return async () => {
        const simulate = await args.loadSimulator();
        const LotkaVolterra = (await import("./lotka_volterra")).default;
        return {
            contentVersion: 0,
            initialContent: types.newLotkaVolterraProblemData,
            component: (props: ModelAnalysisProps<types.LotkaVolterraProblemData>) => (
                <LotkaVolterra simulate={simulate} {...props} />
            ),
        };
    };
}

export function loadKuramotoAnalysis(args: {
    loadSimulator: () => Promise<types.KuramotoSimulator>;
    couplingLabel?: string;
    dampingLabel?: string;
    forcingLabel?: string;
}): () => Promise<ModelAnalysisBuilder<types.KuramotoProblemData>> {
    return async () => {
        const simulate = await args.loadSimulator();
        const Kuramoto = (await import("./kuramoto")).default;
        return {
            contentVersion: 0,
            initialContent: types.newKuramotoProblemData,
            component: (props: ModelAnalysisProps<types.KuramotoProblemData>) => (
                <Kuramoto
                    simulate={simulate}
                    couplingLabel={args.couplingLabel}
                    dampingLabel={args.dampingLabel}
                    forcingLabel={args.forcingLabel}
                    {...props}
                />
            ),
        };
    };
}

export function loadMassActionAnalysis(args: {
    loadSimulator: () => Promise<types.MassActionSimulator>;
    ratesHaveGranularity: boolean;
    transitionType?: MorType;
}): () => Promise<ModelAnalysisBuilder<types.MassActionProblemData>> {
    return async () => {
        const simulate = await args.loadSimulator();
        const MassAction = (await import("./mass_action")).default;
        return {
            contentVersion: 0,
            initialContent: types.newMassActionProblemData,
            component: (props: ModelAnalysisProps<types.MassActionProblemData>) => (
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
    loadEquations: () => Promise<types.MassActionEquations>;
    ratesHaveGranularity: boolean;
}): () => Promise<ModelAnalysisBuilder<types.MassActionEquationsData>> {
    return async () => {
        const getEquations = await args.loadEquations();
        const MassActionEquationsDisplay = (await import("./mass_action_equations")).default;
        return {
            contentVersion: 0,
            initialContent: types.newMassActionEquationsData,
            component: (props: ModelAnalysisProps<types.MassActionEquationsData>) => (
                <MassActionEquationsDisplay
                    getEquations={getEquations}
                    ratesHaveGranularity={args.ratesHaveGranularity}
                    {...props}
                />
            ),
        };
    };
}

export function loadPolynomialODEAnalysis(args: {
    loadSimulator: () => Promise<types.PolynomialODESimulator>;
    signedContributions: boolean;
}): () => Promise<ModelAnalysisBuilder<types.PolynomialODEProblemData>> {
    return async () => {
        const simulate = await args.loadSimulator();
        const PolynomialODESimulation = (await import("./polynomial_ode_simulation")).default;
        return {
            contentVersion: 0,
            initialContent: types.newPolynomialODEProblemData,
            component: (props: ModelAnalysisProps<types.PolynomialODEProblemData>) => (
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
    loadEquations: () => Promise<types.PolynomialODEEquations>;
}): () => Promise<ModelAnalysisBuilder<types.PolynomialODEEquationsData>> {
    return async () => {
        const getEquations = await args.loadEquations();
        const PolynomialODEEquationsDisplay = (await import("./polynomial_ode_equations")).default;
        return {
            contentVersion: 0,
            initialContent: types.newPolynomialODEEquationsData,
            component: (props: ModelAnalysisProps<types.PolynomialODEEquationsData>) => (
                <PolynomialODEEquationsDisplay getEquations={getEquations} {...props} />
            ),
        };
    };
}
