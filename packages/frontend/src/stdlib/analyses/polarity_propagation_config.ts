import * as GraphLayoutConfig from "../../visualization/graph_layout_config";
import type { Sign } from "./sign_hyperfield";

/** Content of a polarity-propagation analysis: layout config plus a chosen
influence sign for each causal edge (keyed by morphism-generator id). */
export type PolarityContent = GraphLayoutConfig.Config & {
    signs: Record<string, Sign>;
};

/** The default content: a fresh layout config and no explicit signs (so every
causal edge starts at `+`). */
export function defaultPolarityContent(): PolarityContent {
    return { ...GraphLayoutConfig.defaultConfig(), signs: {} };
}
