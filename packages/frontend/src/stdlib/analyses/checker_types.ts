import type {
    DblModel,
    MotifOccurrence,
    MotifsOptions,
    ReachabilityProblemData,
} from "catlog-wasm";

export type { ReachabilityProblemData, MotifOccurrence, MotifsOptions };

export type MotifFinder = (model: DblModel, options: MotifsOptions) => MotifOccurrence[];

/** Configuration and state of a motif finding analysis. */
export type MotifFindingAnalysisContent = {
    /** Index of active submodel. */
    activeIndex: number;

    /** Maximum length of paths used in morphism search. */
    maxPathLength?: number | null;
};

export type ReachabilityChecker = (model: DblModel, data: ReachabilityProblemData) => boolean;
