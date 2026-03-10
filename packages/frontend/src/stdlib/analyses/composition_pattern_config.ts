/** Configuration types for the composition pattern analysis. */

/** Valid directions for the composition pattern layout. */
export const directions = ["horizontal", "vertical"] as const;

/** Direction for the composition pattern layout. */
export type Direction = (typeof directions)[number];

/** Check whether a string is a valid direction. */
export function isDirection(value: string): value is Direction {
    return (directions as readonly string[]).includes(value);
}

/** Configuration for the composition pattern (undirected wiring diagram) analysis. */
export interface CompositionPatternConfig {
    direction: Direction;
}

/** Default configuration. */
export const defaultCompositionPatternConfig = (): CompositionPatternConfig => ({
    direction: "horizontal",
});
