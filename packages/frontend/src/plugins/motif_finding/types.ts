import type { DblModel, MotifOccurrence, MotifsOptions } from "catlog-wasm";

export type { MotifOccurrence, MotifsOptions };

export type MotifFinder = (model: DblModel, options: MotifsOptions) => MotifOccurrence[];

/** Configuration and state of a motif finding analysis. */
export type MotifFindingContent = {
    /** Index of active submodel. */
    activeIndex: number;

    /** Whether or not to search up to a maximum length of paths. */
    enableMaxPathLength?: boolean;

    /** Maximum length of paths used in morphism search. */
    maxPathLength?: number | null;
};

export const newMotifFindingContent = (): MotifFindingContent => ({
    activeIndex: 0,
    enableMaxPathLength: true,
    maxPathLength: 5,
});
