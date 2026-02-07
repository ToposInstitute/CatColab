import type * as Viz from "@viz-js/viz";

import type { DblModel, QualifiedName } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import type { Theory } from "../../theory";
import {
    type GraphLayoutConfig,
    type GraphSpec,
    type GraphvizAttributes,
    graphToViz,
} from "../../visualization";
import * as graphStyles from "../graph_styles";
import { GraphVisualization } from "./graph_visualization";

/** Visualize a model of a double theory as a graph.

Such a visualization makes sense for models of any discrete double theory since
the generating data for such a model is just a typed graph. For other kinds of
double theories, the visualization will ignore any basic morphism whose domain
or codomain is not a basic object.
 */
export default function ModelGraph(
    props: ModelAnalysisProps<GraphLayoutConfig.Config> & {
        title?: string;
    },
) {
    const graph = () => {
        const theory = props.liveModel.theory();
        const model = props.liveModel.elaboratedModel();
        if (theory && model) {
            return modelToGraphviz(model, theory);
        }
    };

    return (
        <GraphVisualization
            title={props.title}
            graph={graph()}
            config={props.content}
            changeConfig={props.changeContent}
        />
    );
}

/** Convert a model of a double theory into a graph. */
export function modelToGraph(
    model: DblModel,
    theory: Theory,
    obGenerators?: QualifiedName[],
    morGenerators?: QualifiedName[],
): GraphSpec.Graph {
    const nodes: GraphSpec.Node[] = [];
    for (const id of obGenerators ?? model.obGenerators()) {
        const ob = model.obPresentation(id);
        const meta = theory.modelObTypeMeta(ob.obType);
        nodes.push({
            id,
            label: ob.label?.join(".") ?? "",
            cssClass: graphStyles.svgNodeCssClasses(meta).join(" "),
            isMonospaced: graphStyles.isMonospaced(meta),
        });
    }

    const edges: GraphSpec.Edge[] = [];
    for (const id of morGenerators ?? model.morGenerators()) {
        const mor = model.morPresentation(id);
        if (!(mor && mor.dom.tag === "Basic" && mor.cod.tag === "Basic")) {
            continue;
        }
        const meta = theory.modelMorTypeMeta(mor.morType);
        const label = mor.label?.every((seg) => seg !== "") ? mor.label.join(".") : "";
        edges.push({
            id,
            source: mor.dom.content,
            target: mor.cod.content,
            label,
            style: meta?.arrowStyle ?? "default",
            cssClass: graphStyles.svgEdgeCssClasses(meta).join(" "),
            isMonospaced: graphStyles.isMonospaced(meta),
        });
    }

    return { nodes, edges };
}

/** Convert a model of a double theory into a Graphviz graph. */
export function modelToGraphviz(
    model: DblModel,
    theory: Theory,
    attributes?: GraphvizAttributes,
    obGenerators?: QualifiedName[],
    morGenerators?: QualifiedName[],
): Viz.Graph {
    return graphToViz(modelToGraph(model, theory, obGenerators, morGenerators), {
        graph: { ...graphStyles.defaultGraphAttributes, ...attributes?.graph },
        node: { ...graphStyles.defaultNodeAttributes, ...attributes?.node },
        edge: { ...graphStyles.defaultEdgeAttributes, ...attributes?.edge },
    });
}
