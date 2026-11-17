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

export type ModelAnalysisPlugin = AnalysisManifest & {
    type: "model";
    load: (manifest: AnalysisManifest) => Promise<ModelAnalysisBuilder<unknown>>;
};

export type DiagramAnalysisPlugin = AnalysisManifest & {
    type: "diagram";
    load: (manifest: AnalysisManifest) => Promise<DiagramAnalysisBuilder<unknown>>;
};

export type AnalysisPlugin = ModelAnalysisPlugin | DiagramAnalysisPlugin;
