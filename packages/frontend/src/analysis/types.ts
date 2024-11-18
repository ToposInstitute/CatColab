import type { Component } from "solid-js";

import type * as catlog from "catlog-wasm";
import type { LiveModelDocument } from "../model";

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

/** An analysis of a model of a double theory. */
export type ModelAnalysis = Analysis<ModelAnalysisContent>;

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
    liveModel: LiveModelDocument;
};

/** Component that renders an analysis of a model. */
export type ModelAnalysisComponent<T extends ModelAnalysisContent> = Component<
    ModelAnalysisProps<T>
>;

/** Content associated with an analysis of a model.

Such content is in addition to the data of the model and can include
configuration or state for the analysis.
 */
export type ModelAnalysisContent =
    | ModelGraphContent
    | SubmodelsAnalysisContent
    | LotkaVolterraContent;

/** Configuration for a graph visualization of a model. */
export type ModelGraphContent = {
    tag: "graph";

    /** Layout engine for graph. */
    layout: "graphviz-directed" | "graphviz-undirected";
};

/** State of a submodels analysis. */
export type SubmodelsAnalysisContent = {
    tag: "submodels";

    /** Index of active submodel. */
    activeIndex: number;
};

/** Configuration for a Lotka-Volterra ODE analysis of a model. */
export type LotkaVolterraContent = {
    tag: "lotka-volterra";
} & catlog.LotkaVolterraProblemData<string>;
