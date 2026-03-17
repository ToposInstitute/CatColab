import { lazy } from "solid-js";

import type { ModelAnalysisMeta } from "../theory";
import {
    type CompositionPatternConfig,
    defaultCompositionPatternConfig,
} from "./analyses/composition_pattern_config";

export const compositionPattern = (): ModelAnalysisMeta<CompositionPatternConfig> => ({
    id: "composition-pattern",
    name: "Composition pattern",
    help: "composition-pattern",
    component: CompositionPattern,
    initialContent: defaultCompositionPatternConfig,
    description: "Visualize the composition pattern of the model as an undirected wiring diagram",
});

const CompositionPattern = lazy(() => import("./analyses/composition_pattern"));
