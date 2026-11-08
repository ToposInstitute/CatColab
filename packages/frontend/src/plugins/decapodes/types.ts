/** Configuration for a Decapodes analysis of a diagram. */
export type DecapodesAnalysisContent = {
    domain: string | null;
    mesh: string | null;
    initialConditions: Record<string, string>;
    plotVariables: Record<string, boolean>;
    scalars: Record<string, number>;
    duration: number;
};

export const defaultDecapodesAnalysisContent = (): DecapodesAnalysisContent => ({
    domain: null,
    mesh: null,
    initialConditions: {},
    plotVariables: {},
    scalars: {},
    duration: 10,
});
