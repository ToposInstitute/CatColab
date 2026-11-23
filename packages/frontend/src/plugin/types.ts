import type { AnalysisType } from "catcolab-document-types";
import type { Doctrine } from "catlog-wasm";
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
        doctrine?: Array<Doctrine>;
        theory?: Array<string>;
        model?: Array<string>;
    };
};

/** Contribution of an analysis of models. */
export type ModelAnalysisContribution = AnalysisManifest & {
    type: "model";
    load: (manifest: AnalysisManifest) => Promise<ModelAnalysisBuilder<unknown>>;
};

/** Contribution of an analysis of diagrams. */
export type DiagramAnalysisContribution = AnalysisManifest & {
    type: "diagram";
    load: (manifest: AnalysisManifest) => Promise<DiagramAnalysisBuilder<unknown>>;
};

/** Contribution of an analysis. */
export type AnalysisContribution = ModelAnalysisContribution | DiagramAnalysisContribution;
