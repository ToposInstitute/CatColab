import type * as Viz from "@viz-js/viz";

import { type DblModel, collectProduct } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import type { ModelAnalysisMeta } from "../../theory";
import { GraphLayoutConfig } from "../../visualization";
import * as graphStyles from "../graph_styles";
import { GraphVisualization } from "./graph_visualization";

import svgStyles from "../svg_styles.module.css";

/** Configure a visualization of a Petri net. */
export function configurePetriNetVisualization(options: {
    id: string;
    name: string;
    description?: string;
}): ModelAnalysisMeta<GraphLayoutConfig.Config> {
    const { id, name, description } = options;
    return {
        id,
        name,
        description,
        component: PetriNetVisualization,
        initialContent: GraphLayoutConfig.defaultConfig,
    };
}

/** Visualize a Petri net. */
export function PetriNetVisualization(props: ModelAnalysisProps<GraphLayoutConfig.Config>) {
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
        nodes.push({
            name: id,
            attributes: {
                id,
                label: model.obGeneratorLabel(id)?.join(".") ?? "",
                class: svgStyles["place"],
                width: "0.5",
                height: "0.5",
            },
        });
    }

    /// Add nodes for transitions and edges for arcs.
    const edges: Required<Viz.Graph>["edges"] = [];
    for (const id of model.morGenerators()) {
        nodes.push({
            name: id,
            attributes: {
                id,
                label: model.morGeneratorLabel(id)?.join(".") ?? "",
                class: svgStyles["transition"],
                width: "1",
                height: "0.25",
            },
        });

        const [dom, cod] = [model.getDom(id), model.getCod(id)];
        for (const ob of dom ? collectProduct(dom) : []) {
            if (ob.tag !== "Basic") {
                continue;
            }
            edges.push({
                head: id,
                tail: ob.content,
            });
        }
        for (const ob of cod ? collectProduct(cod) : []) {
            if (ob.tag !== "Basic") {
                continue;
            }
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
