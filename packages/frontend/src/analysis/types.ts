import type { Component } from "solid-js";

import type * as catlog from "catlog-wasm";
import type { LiveModelDocument } from "../document";

/** Analysis of a model of a double theory.

Such an analysis could be a visualization, a simulation, or a translation of the
model into another format. Analyses can have their own content or state going
beyond the data of the model, such as numerical parameters for a simulation.
 */
export type ModelAnalysis = {
    /** Identifier of the analysis, unique relative to the theory. */
    id: string;

    /** Content associated with the analysis. */
    content: ModelAnalysisContent;
};

/** Component that renders an analysis of a model. */
export type ModelAnalysisComponent<T extends ModelAnalysisContent> = Component<
    ModelAnalysisProps<T>
>;

/** Props passed to a model analysis component. */
export type ModelAnalysisProps<T> = {
    /** The model being analyzed. */
    liveModel: LiveModelDocument;

    /** Content associated with the analysis itself. */
    content: T;

    /** Update content associated with the analysis. */
    changeContent: (f: (content: T) => void) => void;
};

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
} & catlog.LotkaVolterraConfig<string>;
