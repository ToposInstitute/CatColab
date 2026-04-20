import type { Component } from "solid-js";

import type { LiveDiagramDoc } from "../diagram";
import type { LiveModelDoc } from "../model";

/** An analysis of a formal object.

An analysis is currently a catch-all concept for an output derived from a model,
an instance, or other formal objects in the system. An analysis could be a
visualization, a simulation, or a translation of the formal object into another
format. Analyses can have their own content or internal state, such as numerical
parameters fo a simulation.
 */
export type Analysis<T> = {
    /** Identifier of the analysis, unique relative to the theory. */
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
