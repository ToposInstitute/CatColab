/** Analyses of formal objects.

An analysis is currently a catch-all concept for an output derived from a model,
an instance, or other formal objects in the system. An analysis could be a
visualization, a simulation, or a translation of the formal object into another
format. Analyses can have their own content or internal state, such as layout
settings for a visualization or numerical parameters for a simulation.

@packageDocumentation
 */

import type { Component } from "solid-js";

import type { LiveDiagramDoc } from "../diagram";
import type { LiveModelDoc } from "../model";

/** A realization of an analysis, typically in a notebook. */
export type Analysis<T> = {
    /** Identifier of the analysis. */
    id: string;

    /** Content associated with the analysis. */
    content: T;
};

/** Props passed to any analysis component. */
export type AnalysisProps<T> = {
    /** Content associated with the analysis itself. */
    content: T;

    /** Update content associated with the analysis. */
    changeContent: (f: (content: T) => void) => void;
};

/** Props passed to a model analysis component. */
export type ModelAnalysisProps<T> = AnalysisProps<T> & {
    /** The model being analyzed. */
    liveModel: LiveModelDoc;
};

/** Component that renders an analysis of a model. */
export type ModelAnalysisComponent<T> = Component<ModelAnalysisProps<T>>;

/** Props passed to a diagram analysis component. */
export type DiagramAnalysisProps<T> = AnalysisProps<T> & {
    /** The diagram being analyzed. */
    liveDiagram: LiveDiagramDoc;
};

/** Component that renders an analysis of diagram model. */
export type DiagramAnalysisComponent<T> = Component<DiagramAnalysisProps<T>>;

/** Constructs and migrates realizations of an analysis. */
export type AnalysisBuilder<T> = {
    /** Version number for content data format.

    Bump this version number when the data format for the analysis' data format
    changes in a backwards-incompatible way and needs to be migrated. Note that
    this field is *only* for migration purposes; it is not a semantic version
    and is unrelated to the feature set provided by the analysis.
     */
    contentVersion: number;

    /** Construct the initial content of the analysis. */
    initialContent: () => T;

    /** Migrate content from old version to current version. */
    migrateContent?: (old: unknown, version: number) => T;
};

export type ModelAnalysisBuilder<T> = AnalysisBuilder<T> & {
    /** Component that renders the analysis. */
    component: ModelAnalysisComponent<T>;
};

export type DiagramAnalysisBuilder<T> = AnalysisBuilder<T> & {
    /** Component that renders the analysis. */
    component: DiagramAnalysisComponent<T>;
};
