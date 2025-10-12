import type * as Viz from "@viz-js/viz";

import type { DblModel, QualifiedName } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import type { ModelAnalysisMeta, Theory } from "../../theory";
import { GraphLayoutConfig, type GraphvizAttributes } from "../../visualization";
import * as graphStyles from "../graph_styles";
import { GraphVisualization } from "./graph_visualization";

/** Configure a graph visualization for use with models of a double theory. */
export function configureModelGraph(options: {
    id: string;
    name: string;
    description?: string;
    help?: string;
}): ModelAnalysisMeta<GraphLayoutConfig.Config> {
    const { id, name, description, help } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => <ModelGraph title={name} {...props} />,
        initialContent: GraphLayoutConfig.defaultConfig,
    };
}

/** Visualize a model of a double theory as a graph.

Such a visualization makes sense for models of any discrete double theory since
the generating data for such a model is just a typed graph. For other kinds of
double theories, the visualization will ignore any basic morphism whose domain
or codomain is not a basic object.
 */
export function ModelGraph(
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
        const obType = model.obType({ tag: "Basic", content: id });
        const meta = theory.modelObTypeMeta(obType);
        nodes.push({
            name: id,
            attributes: {
                id,
                label: model.obGeneratorLabel(id)?.join(".") ?? "",
                class: graphStyles.svgCssClasses(meta).join(" "),
                fontname: graphStyles.graphvizFontname(meta),
            },
        });
    }

    const edges: Required<Viz.Graph>["edges"] = [];
    for (const id of morGenerators ?? model.morGenerators()) {
        const [dom, cod] = [model.getDom(id), model.getCod(id)];
        if (!(dom?.tag === "Basic" && cod?.tag === "Basic")) {
            continue;
        }
        const morType = model.morType({ tag: "Basic", content: id });
        const meta = theory.modelMorTypeMeta(morType);
        edges.push({
            head: cod.content,
            tail: dom.content,
            attributes: {
                id: id,
                label: model.morGeneratorLabel(id)?.join(".") ?? "",
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
