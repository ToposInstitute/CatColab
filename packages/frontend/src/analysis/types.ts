import type { Component } from "solid-js";

import type { DblModel } from "catlog-wasm";
import type { ModelJudgment } from "../model";
import type { Theory } from "../theory";

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
    model: Array<ModelJudgment>;

    /** The `catlog` representation of the model, if the model is valid. */
    validatedModel: DblModel | null;

    /** Theory that the model is of.

    Some analyses are only applicable to a single theory but the theory is
    passed regardless.
     */
    theory: Theory;

    /** Content associated with the analysis itself. */
    content: T;

    /** Update content associated with the analysis. */
    changeContent: (f: (content: T) => void) => void;
};

/** Content associated with an analysis of a model.

This content is in addition to the data of the model and can include
configuration or state for the analysis.
 */
export type ModelAnalysisContent = ModelGraphContent | SubmodelsAnalysisContent;

/** Configuration of a graph visualization of a model. */
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
