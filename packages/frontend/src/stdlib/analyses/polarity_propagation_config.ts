import * as GraphLayoutConfig from "../../visualization/graph_layout_config";
import type { Sign } from "./sign_hyperfield";

/** Content of a polarity-propagation analysis: layout config, a chosen influence
sign for each causal edge (keyed by morphism-generator id), and a seed polarity
for each action (keyed by object-generator id). */
export type PolarityContent = GraphLayoutConfig.Config & {
    signs: Record<string, Sign>;
    seeds: Record<string, Sign>;
};

/** The default content: a fresh layout config with no explicit edge signs (each
causal edge starts at `+`) and no explicit action seeds (sources default to `+`,
internal actions to `0`). */
export function defaultPolarityContent(): PolarityContent {
    return { ...GraphLayoutConfig.defaultConfig(), signs: {}, seeds: {} };
}
