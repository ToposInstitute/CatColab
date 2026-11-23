import type { AnalysisType } from "catcolab-document-types";
import type { Doctrine } from "catlog-wasm";
import type { DiagramAnalysisBuilder, ModelAnalysisBuilder } from "../analysis";

/** Manifest for an analysis contributed by a plugin. */
export type AnalysisManifest = {
    /** Name of analysis.

    Must be unique within the plugin. Must not contain whitespace or a slash.
     */
    name: string;

    /** Human-readable label for analysis. */
    label: string;

    /** Short description of analysis. */
    description?: string;

    /** Name of the help page (excluding file extension) for the analysis, if any. */
    help?: string;

    /** Type of entity that analysis is of: model, diagram, etc. */
    analysisType: AnalysisType;

    /** Scope of applicability of analysis.

    The analysis will apply iff *all* supplied constraints are satisfied.
     */
    scope: {
        doctrine?: Array<Doctrine>;
        theory?: Array<string>;
        model?: Array<string>;
    };
};

type ModelAnalysisContributionContent = AnalysisManifest & {
    analysisType: "model";
    load: (manifest: AnalysisManifest) => Promise<ModelAnalysisBuilder<unknown>>;
};

type DiagramAnalysisContributionContent = AnalysisManifest & {
    analysisType: "diagram";
    load: (manifest: AnalysisManifest) => Promise<DiagramAnalysisBuilder<unknown>>;
};

export type AnalysisContributionContent =
    | ModelAnalysisContributionContent
    | DiagramAnalysisContributionContent;
