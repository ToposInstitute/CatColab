/** Configuration types for the composition pattern analysis. */

/** Configuration for the composition pattern (undirected wiring diagram) analysis. */
// biome-ignore lint/suspicious/noEmptyInterface: keep for future extensibility
export interface CompositionPatternConfig {}

/** Default configuration. */
export const defaultCompositionPatternConfig = (): CompositionPatternConfig => ({});
