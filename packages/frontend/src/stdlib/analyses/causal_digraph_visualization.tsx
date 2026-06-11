import type { DblModel, MorType, ObType } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import type { GraphLayoutConfig, GraphSpec } from "../../visualization";
import { GraphVisualizationAnalysis } from "./graph_visualization";

import styles from "./causal_digraph_visualization.module.css";

const ACTION: ObType = { tag: "Basic", content: "Action" };
const CAUSAL: MorType = { tag: "Basic", content: "Causal" };
const GRADING: MorType = { tag: "Basic", content: "Grading" };

/** Visualize the document side of a causal hypergraph model.

This is the "R-graded digraph" of the toy example: the (red) action vertices, the
(green) causal edges between them, and the (dashed) grading/temporal-order edges.
Causal and grading edges are morphisms, so each is drawn directly from its domain
action to its codomain action. The extracted hypergraph (causal edges as vertices,
blue hyperedges) is shown by the separate hypergraph visualization.
 */
export default function CausalDigraphVisualization(
    props: ModelAnalysisProps<GraphLayoutConfig.Config>,
) {
    const graph = () => {
        const model = props.liveModel.elaboratedModel();
        if (model) {
            return causalDigraphFromModel(model);
        }
    };

    return (
        <GraphVisualizationAnalysis
            graph={graph()}
            config={props.content}
            changeConfig={props.changeContent}
        />
    );
}

function causalDigraphFromModel(model: DblModel): GraphSpec.Graph {
    const nodes: GraphSpec.Node[] = [];
    for (const id of model.obGeneratorsWithType(ACTION)) {
        const ob = model.obPresentation(id);
        nodes.push({
            id,
            label: ob.label?.join(".") ?? "",
            cssClass: styles.action,
            minimumWidth: 36,
            minimumHeight: 36,
        });
    }

    // Each causal/grading edge is a morphism between actions, drawn directly.
    const edges: GraphSpec.Edge[] = [];
    const addMorphismEdges = (morType: MorType, cssClass: string) => {
        for (const id of model.morGeneratorsWithType(morType)) {
            const mor = model.morPresentation(id);
            if (!(mor && mor.dom.tag === "Basic" && mor.cod.tag === "Basic")) {
                continue;
            }
            edges.push({
                id,
                source: mor.dom.content,
                target: mor.cod.content,
                label: mor.label?.join(".") ?? "",
                cssClass,
            });
        }
    };
    addMorphismEdges(CAUSAL, styles.causal);
    addMorphismEdges(GRADING, styles.grading);

    return { nodes, edges };
}
