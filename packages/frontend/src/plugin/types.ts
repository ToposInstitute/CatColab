import type { AnalysisType } from "catcolab-document-types";
import type { DiagramAnalysisBuilder, ModelAnalysisBuilder } from "../analysis";

/** Manifest for an analysis contributed by a plugin. */
export type AnalysisManifest = {
    /** Globally unique identifier of analysis. */
    id: string;

    /** Human-readable name of analysis. */
    name: string;

    /** Short description of analysis. */
    description?: string;

    /** Name of the help page (excluding file extension) for the analysis, if any. */
    help?: string;

    /** Type of entity that analysis is of: model, diagram, etc. */
    type: AnalysisType;

    /** Scope of applicability of analysis.

    The analysis will apply iff *all* supplied constraints are satisfied.
     */
    scope: {
        doctrine?: Array<"discrete" | "discrete_tab" | "model">;
        theory?: Array<string>;
        model?: Array<string>;
    };
};

export type ModelAnalysisPlugin = AnalysisManifest & {
    type: "model";
    load: () => Promise<ModelAnalysisBuilder<any>>;
};

export type DiagramAnalysisPlugin = AnalysisManifest & {
    type: "diagram";
    load: () => Promise<DiagramAnalysisBuilder<any>>;
};
