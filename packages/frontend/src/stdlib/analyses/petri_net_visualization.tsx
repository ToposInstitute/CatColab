import invariant from "tiny-invariant";

import { collectProduct, type DblModel } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import type { GraphLayoutConfig, GraphSpec } from "../../visualization";
import svgStyles from "../svg_styles.module.css";
import { GraphVisualizationAnalysis } from "./graph_visualization";

/** Visualize a Petri net. */
export default function PetriNetVisualization(props: ModelAnalysisProps<GraphLayoutConfig.Config>) {
    const graph = () => {
        const model = props.liveModel.elaboratedModel();
        if (model) {
            return petriNetToGraph(model);
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

/** Convert a Petri net into a graph.

Both the places and the transitions become nodes in the graph.
 */
export function petriNetToGraph(model: DblModel): GraphSpec.Graph {
    // Add nodes for places.
    const nodes: GraphSpec.Node[] = [];
    for (const id of model.obGenerators()) {
        const ob = model.obPresentation(id);
        nodes.push({
            id,
            label: ob.label?.join(".") ?? "",
            cssClass: svgStyles["place"],
            minimumWidth: 36,
            minimumHeight: 36,
        });
    }

    /// Add nodes for transitions and edges for arcs.
    const edges: GraphSpec.Edge[] = [];
    for (const id of model.morGenerators()) {
        const mor = model.morPresentation(id);
        if (!mor) {
            continue;
        }
        nodes.push({
            id,
            label: mor.label?.join(".") ?? "",
            cssClass: svgStyles["transition"],
            minimumWidth: 72,
            minimumHeight: 18,
        });

        for (const [i, ob] of collectProduct(mor.dom).entries()) {
            invariant(ob.tag === "Basic");
            edges.push({
                id: `${id}:dom:${i}`,
                source: ob.content,
                target: id,
            });
        }
        for (const [i, ob] of collectProduct(mor.cod).entries()) {
            invariant(ob.tag === "Basic");
            edges.push({
                id: `${id}:cod:${i}`,
                source: id,
                target: ob.content,
            });
        }
    }

    return { nodes, edges };
}
