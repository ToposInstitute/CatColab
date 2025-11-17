import type * as Viz from "@viz-js/viz";
import invariant from "tiny-invariant";

import { collectProduct, type DblModel } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import type { GraphLayoutConfig } from "../../visualization";
import * as graphStyles from "../graph_styles";
import svgStyles from "../svg_styles.module.css";
import { GraphVisualization } from "./graph_visualization";

/** Visualize a Petri net. */
export default function PetriNetVisualization(props: ModelAnalysisProps<GraphLayoutConfig.Config>) {
    const graph = () => {
        const model = props.liveModel.elaboratedModel();
        if (model) {
            return petriNetToGraphviz(model);
        }
    };

    return (
        <GraphVisualization
            graph={graph()}
            config={props.content}
            changeConfig={props.changeContent}
        />
    );
}

/** Convert a Petri net into a Graphviz graph.

Both the places and the transitions become nodes in the graph.
 */
export function petriNetToGraphviz(model: DblModel): Viz.Graph {
    // Add nodes for places.
    const nodes: Required<Viz.Graph>["nodes"] = [];
    for (const id of model.obGenerators()) {
        const ob = model.obPresentation(id);
        nodes.push({
            name: id,
            attributes: {
                id,
                label: ob.label?.join(".") ?? "",
                class: svgStyles["place"],
                width: "0.5",
                height: "0.5",
            },
        });
    }

    /// Add nodes for transitions and edges for arcs.
    const edges: Required<Viz.Graph>["edges"] = [];
    for (const id of model.morGenerators()) {
        const mor = model.morPresentation(id);
        if (!mor) {
            continue;
        }
        nodes.push({
            name: id,
            attributes: {
                id,
                label: mor.label?.join(".") ?? "",
                class: svgStyles["transition"],
                width: "1",
                height: "0.25",
            },
        });

        for (const ob of collectProduct(mor.dom)) {
            invariant(ob.tag === "Basic");
            edges.push({
                head: id,
                tail: ob.content,
            });
        }
        for (const ob of collectProduct(mor.cod)) {
            invariant(ob.tag === "Basic");
            edges.push({
                head: ob.content,
                tail: id,
            });
        }
    }

    return {
        directed: true,
        nodes,
        edges,
        graphAttributes: {
            ...graphStyles.defaultGraphAttributes,
            fontname: "Helvetica",
        },
        nodeAttributes: graphStyles.defaultNodeAttributes,
        edgeAttributes: graphStyles.defaultEdgeAttributes,
    };
}
