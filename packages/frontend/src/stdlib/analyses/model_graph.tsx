import type * as Viz from "@viz-js/viz";

import type { DblModel, QualifiedName } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import type { Theory } from "../../theory";
import type { GraphLayoutConfig, GraphvizAttributes } from "../../visualization";
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

/** Convert a model of a double theory into a Graphviz graph. */
export function modelToGraphviz(
    model: DblModel,
    theory: Theory,
    attributes?: GraphvizAttributes,
    obGenerators?: QualifiedName[],
    morGenerators?: QualifiedName[],
): Viz.Graph {
    const nodes: Required<Viz.Graph>["nodes"] = [];
    for (const id of obGenerators ?? model.obGenerators()) {
        const ob = model.obPresentation(id);
        const meta = theory.modelObTypeMeta(ob.obType);
        nodes.push({
            name: id,
            attributes: {
                id,
                label: ob.label?.join(".") ?? "",
                class: graphStyles.svgCssClasses(meta).join(" "),
                fontname: graphStyles.graphvizFontname(meta),
            },
        });
    }

    const edges: Required<Viz.Graph>["edges"] = [];
    for (const id of morGenerators ?? model.morGenerators()) {
        const mor = model.morPresentation(id);
        if (!(mor && mor.dom.tag === "Basic" && mor.cod.tag === "Basic")) {
            continue;
        }
        const meta = theory.modelMorTypeMeta(mor.morType);
        const label = mor.label?.every((seg) => seg !== "") ? mor.label.join(".") : "";
        edges.push({
            head: mor.cod.content,
            tail: mor.dom.content,
            attributes: {
                id,
                label,
                class: graphStyles.svgCssClasses(meta).join(" "),
                fontname: graphStyles.graphvizFontname(meta),
                // Not recognized by Graphviz but will be passed through!
                arrowstyle: meta?.arrowStyle ?? "default",
            },
        });
    }

    return {
        directed: true,
        nodes,
        edges,
        graphAttributes: { ...graphStyles.defaultGraphAttributes, ...attributes?.graph },
        nodeAttributes: { ...graphStyles.defaultNodeAttributes, ...attributes?.node },
        edgeAttributes: { ...graphStyles.defaultEdgeAttributes, ...attributes?.edge },
    };
}
